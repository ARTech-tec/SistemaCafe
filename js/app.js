    let allPurchases = [];
    let filteredPurchases = [];
    const COFFEE_TYPES = [
        'Maduro',
        'Verde',
        'Seco',
        'Pergamino',
        'Oro',
        'Cereza'
    ];
    let allClients = [];
    let currentPrices = {}; 
    let selectedPurchase = null;
    let currentWeekStartInline = null;
    let currentUser = null;
    let currentRole = null;
    let currentPaymentData = [];
    let coffeeTypeChart = null;

    document.addEventListener('DOMContentLoaded', function() {
      loadData();
      setTodayDate();
      loadYearOptions();
      
      const localDate = getServerDate();
      if (document.getElementById('reportDailyDate')) {
        document.getElementById('reportDailyDate').value = localDate;
      }
      if (document.getElementById('reportPaymentsDate')) {
        document.getElementById('reportPaymentsDate').value = localDate;
      }
      if (document.getElementById('reportMovementsDate')) {
        document.getElementById('reportMovementsDate').value = localDate;
      }
      
      loadCurrentWeekInline();
      switchReportTab('daily');

      const loginForm = document.getElementById('loginForm');
      if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
          e.preventDefault();
          performLogin();
        });
      }
      firebase.auth().onAuthStateChanged(async (user) => {

        if (user) {

          const username = user.email.replace('@sistemacafe.local', '');

          try {

            const querySnapshot = await db
              .collection('Usuarios')
              .where('Usuario', '==', username)
              .get();

            if (!querySnapshot.empty) {

              const userData = querySnapshot.docs[0].data();

              currentUser = userData.Usuario;

              currentRole =
                String(userData.Rol)
                  .toLowerCase()
                  .includes('admin')
                  ? 'administrador'
                  : 'comprador';

              applyRoleRestrictions();
            }

            document.getElementById('loginView')
              .classList.add('hidden');

            document.getElementById('appView')
              .classList.remove('hidden');

            loadData();

          } catch (error) {

            console.error(error);

          }

        }

      });

    });

    function performLogin() {

  const user = document.getElementById('loginUser').value.trim();
  const pass = document.getElementById('loginPass').value.trim();

  const errDiv = document.getElementById('loginError');

  if (!user || !pass) {
    errDiv.textContent = 'Ingrese usuario y contraseña';
    errDiv.classList.remove('hidden');
    return;
  }

  const email = user + '@sistemacafe.local';

  firebase.auth()
    .signInWithEmailAndPassword(email, pass)
    .then(() => {

      return db.collection('Usuarios')
        .where('Usuario', '==', user)
        .get();

    })
    .then((querySnapshot) => {

      if (querySnapshot.empty) {
        throw new Error('Usuario no encontrado');
      }

      let userData = null;

      querySnapshot.forEach((doc) => {
        userData = doc.data();
      });

      currentUser = userData.Usuario;

      currentRole =
        String(userData.Rol)
          .toLowerCase()
          .includes('admin')
          ? 'administrador'
          : 'comprador';

      errDiv.classList.add('hidden');

      document.getElementById('loginView')
        .classList.add('hidden');

      document.getElementById('appView')
        .classList.remove('hidden');

      applyRoleRestrictions();

      inicializarPrecios()
    .then(() => {
        loadData();
    });

    })
    .catch((error) => {

      console.error(error);

      errDiv.textContent =
        'Usuario o contraseña incorrectos';

      errDiv.classList.remove('hidden');

    });

  }

    function applyRoleRestrictions() {
      if (currentRole === 'comprador') {
        const btnPrecios = document.querySelector('button[onclick*="togglePriceManager"]');
        if (btnPrecios) btnPrecios.style.display = 'none';
        
        const btnReportes = document.querySelector('button[onclick*="toggleReports"]');
        if (btnReportes) btnReportes.style.display = 'none';

        const statsPanel = document.querySelector('.stats');
        if (statsPanel) statsPanel.style.display = 'none';
      }
    }

    function logout() {

    firebase.auth().signOut();

    currentUser = null;
    currentRole = null;

    document.getElementById('loginUser').value = '';
    document.getElementById('loginPass').value = '';

    document.getElementById('appView')
      .classList.add('hidden');

    document.getElementById('loginView')
      .classList.remove('hidden');

    }
    
    function getServerDate() {
      const d = new Date();
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    function registrarAuditoria(accion, documento, detalle) {

        db.collection('Auditoria').add({

            fecha: getServerDate(),

            hora: new Date().toLocaleTimeString(),

            usuario: currentUser || 'Sistema',

            accion: accion,

            documento: documento,

            detalle: detalle,

            timestamp: firebase.firestore.FieldValue.serverTimestamp()

        }).catch(error => {

            console.error('Error auditoría:', error);

        });

 }

    function formatDateForDisplay(dateStr) {
      if (!dateStr) return '';
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return parts[2] + '/' + parts[1] + '/' + parts[0];
      }
      return dateStr;
    }

    function setTodayDate() {
      const localDate = getServerDate();
      if (document.getElementById('purchaseDate')) {
        document.getElementById('purchaseDate').value = localDate;
      }
      if (document.getElementById('reportDailyDate')) {
        document.getElementById('reportDailyDate').value = localDate;
      }
    }

    function renderPurchases() {
      const tbody = document.getElementById('purchasesTable');
      if (!tbody) return;
      
      if (filteredPurchases.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align:center; color:#666;">No hay compras registradas</td></tr>';
        return;
      }

      let html = '';
      filteredPurchases.forEach(p => {
        const badgeClass = p.paid ? 'badge-success' : 'badge-danger';
        const badgeText = p.paid ? 'Pagado' : 'Pendiente';
        
        let actionButtons = '';
        if (!p.paid) {
          actionButtons += `<button class="btn btn-success" style="padding:6px 12px; font-size:11px; margin-right: 5px;" onclick="openPaymentModal('${p.id}')">💵 Pagar</button>`;
        }
        actionButtons += `<button class="btn btn-info" style="padding:6px 12px; font-size:11px;" onclick="printReceipt('${p.receiptNumber}')">🖨️ Recibo</button>`;

        html += `
          <tr>
            <td style="font-family:monospace; font-weight:bold;">${p.receiptNumber}</td>
            <td>${p.clientName}</td>
            <td>${p.coffeeType}</td>
            <td>${p.quantityDisplay}</td>
            <td>${p.pricePerQuintalDisplay}</td>
            <td><span class="benefit-price">${p.benefitPriceDisplay}</span></td>
            <td style="font-weight:bold;">${p.totalDisplay}</td>
            <td><span class="${p.profit >= 0 ? 'profit-positive' : 'profit-negative'}" style="font-weight:bold;">${p.profitDisplay}</span></td>
            <td><span class="badge ${badgeClass}">${badgeText}</span></td>
            <td>${p.dateDisplay}</td>
            <td>${p.paymentDateDisplay || '-'}</td>
            <td>${actionButtons}</td>
          </tr>
        `;
      });
      tbody.innerHTML = html;
    }

    function updateStats() {
      const totalPurchases = allPurchases.length;
      const pendingPurchases = allPurchases.filter(p => !p.paid);
      let totalPaidAmount = 0;

      allPurchases.forEach(p => {
        if (p.paid) {
          totalPaidAmount += (p.total || 0);
        }
      });

      const totalPurchasesEl = document.getElementById('totalPurchases');
      const pendingCountEl = document.getElementById('pendingCount');
      const totalPaidEl = document.getElementById('totalPaid');

      if (totalPurchasesEl) totalPurchasesEl.textContent = totalPurchases;
      if (pendingCountEl) pendingCountEl.textContent = pendingPurchases.length;
      if (totalPaidEl) totalPaidEl.textContent = 'Q' + totalPaidAmount.toFixed(2);

      const batchBtn = document.getElementById('batchPaymentBtn');
      if (batchBtn && pendingPurchases.length > 0) {
        const batchCount = document.getElementById('batchCount');
        if (batchCount) batchCount.textContent = pendingPurchases.length;
        batchBtn.classList.remove('hidden');
      } else if (batchBtn) {
        batchBtn.classList.add('hidden');
      }
    }

    function loadData() {
      db.collection('Compras').get().then((querySnapshot) => {
        allPurchases = [];
        querySnapshot.forEach((doc) => {
          let data = doc.data();
          allPurchases.push({
            rowIdx: doc.id,
            id: doc.id,
            receiptNumber: data.receiptNumber || '',
            clientName: data.clientName || '',
            date: data.date || '',
            coffeeType: data.coffeeType || '',
            quantity: parseFloat(data.quantity) || 0,
            unit: data.unit || 'quintales',
            pricePerQuintal: parseFloat(data.pricePerQuintal) || 0,
            benefitPrice: parseFloat(data.benefitPrice) || 0,
            total: parseFloat(data.total) || 0,
            profit: parseFloat(data.profit) || 0,
            paid: data.paid === true || data.paid === 'TRUE',
            paymentDate: data.paymentDate || '',
            comment: data.comment || '',
            user: data.user || '',
            paymentMethod: data.paymentMethod || 'Efectivo',
            
            dateDisplay: formatDateForDisplay(data.date),
            paymentDateDisplay: data.paymentDate ? formatDateForDisplay(data.paymentDate) : '',
            quantityDisplay: (parseFloat(data.quantity) || 0) + ' ' + (data.unit || 'quintales'),
            pricePerQuintalDisplay: data.pricePerQuintal ? 'Q' + parseFloat(data.pricePerQuintal).toFixed(2) : '-',
            benefitPriceDisplay: data.benefitPrice ? 'Q' + parseFloat(data.benefitPrice).toFixed(2) : '-',
            totalDisplay: data.total ? 'Q' + parseFloat(data.total).toFixed(2) : '-',
            profitDisplay: data.profit !== undefined ? 'Q' + parseFloat(data.profit).toFixed(2) : '-'
          });
        });
        
        filteredPurchases = allPurchases;
        renderPurchases();
        updateStats();
        
        const clientsSet = new Set();
        allPurchases.forEach(p => {
          if (p.clientName) clientsSet.add(p.clientName.trim());
        });
        allClients = Array.from(clientsSet).sort();
        updateClientSelects();

      }).catch((error) => {
        console.error('Error al cargar compras desde Firestore:', error);
      });

      getCurrentPrices();
    }

    function getCurrentPrices() {
      db.collection('Precios').get().then((querySnapshot) => {
        currentPrices = {};
        querySnapshot.forEach((doc) => {
          let data = doc.data();
          let type = data.Tipo || doc.id;
          currentPrices[type] = {
            purchasePrice: parseFloat(data.PrecioCompra) || 0,
            benefitPrice: parseFloat(data.PrecioBeneficio) || 0
          };
        });
        renderPriceManager();
      });
    }

    async function inicializarPrecios() {
        const batch = db.batch();
        let cambios = false;
        for (const tipo of COFFEE_TYPES) {
            const docRef = db.collection('Precios').doc(tipo);
            const doc = await docRef.get();
            if (!doc.exists) {
                cambios = true;
                batch.set(docRef, {
                    Tipo: tipo,
                    PrecioCompra: 0,
                    PrecioBeneficio: 0
                });
            }
        }
        if (cambios) {
            await batch.commit();
            console.log('✅ Precios inicializados');
        }
    }

    function updateClientSelects() {
      const clientsList = document.getElementById('clientsList');
      const filterClient = document.getElementById('filterClient');
      if (!clientsList || !filterClient) return;
      
      clientsList.innerHTML = '';
      filterClient.innerHTML = '<option value="">Todos los clientes</option>';
      allClients.forEach(client => {
        const option = document.createElement('option');
        option.value = client;
        clientsList.appendChild(option);
        const filterOption = document.createElement('option');
        filterOption.value = client;
        filterOption.textContent = client;
        filterClient.appendChild(filterOption);
      });
    }

    function renderPriceManager() {
      const grid = document.getElementById('priceGrid');
      if (!grid) return;
      grid.innerHTML = '';
      
      COFFEE_TYPES.forEach(type => {
        const purchasePrice = currentPrices[type] ? currentPrices[type].purchasePrice || 0 : 0;
        const benefitPrice = currentPrices[type] ? currentPrices[type].benefitPrice || 0 : 0;
        
        const div = document.createElement('div');
        div.className = 'form-group';
        div.innerHTML = `
          <label>${type}</label>
          <div style="display: flex; gap: 10px;">
            <div style="flex: 1;">
              <label style="font-weight: normal; font-size: 12px; margin-bottom: 3px;">Precio Compra (Q)</label>
              <input type="number" step="0.01" value="${purchasePrice.toFixed(2)}" data-type="${type}" data-price-type="purchase" class="price-input" style="width: 100%;">
            </div>
            <div style="flex: 1;">
              <label style="font-weight: normal; font-size: 12px; margin-bottom: 3px;">Precio Beneficio (Q)</label>
              <input type="number" step="0.01" value="${benefitPrice.toFixed(2)}" data-type="${type}" data-price-type="benefit" class="price-input" style="width: 100%;">
            </div>
          </div>
        `;
        grid.appendChild(div);
      });
    }

    function savePrices() {
      const pricesToUpdate = [];
      const coffeeTypes = Object.keys(currentPrices);
      let hasError = false;

      coffeeTypes.forEach(type => {
        const purchaseInput = document.querySelector(`.price-input[data-type="${type}"][data-price-type="purchase"]`);
        const benefitInput = document.querySelector(`.price-input[data-type="${type}"][data-price-type="benefit"]`);

        const purchasePrice = parseFloat(purchaseInput.value);
        const benefitPrice = parseFloat(benefitInput.value);

        if (isNaN(purchasePrice) || purchasePrice < 0 || isNaN(benefitPrice) || benefitPrice < 0) {
            hasError = true;
            return;
        }

        pricesToUpdate.push({ type, purchasePrice, benefitPrice });
      });

      if (hasError) {
          alert('Error: Por favor ingrese precios válidos.');
          return;
      }

      let batch = db.batch();
      pricesToUpdate.forEach(item => {
        let ref = db.collection('Precios').doc(item.type);
        batch.set(ref, {
          Tipo: item.type,
          PrecioCompra: item.purchasePrice,
          PrecioBeneficio: item.benefitPrice
        }, { merge: true });
      });

      batch.commit().then(() => {
        pricesToUpdate.forEach(item => {

        registrarAuditoria(
            'Actualización de precios',
            item.type,
            `Compra: Q${item.purchasePrice} | Beneficio: Q${item.benefitPrice}`
        );

        });
        alert('✅ Precios actualizados exitosamente');
        getCurrentPrices();
        togglePriceManager();
      });
    }

    function showMainView(show) {
      const mainView = document.getElementById('mainTableView');
      if (show) {
        mainView.classList.remove('hidden');
      } else {
        mainView.classList.add('hidden');
      }
    }

    function togglePriceManager() {
      const pm = document.getElementById('priceManager');
      const rep = document.getElementById('reportsSection');
      const form = document.getElementById('purchaseForm');
      rep.classList.add('hidden');
      form.classList.add('hidden');
      pm.classList.toggle('hidden');
      showMainView(pm.classList.contains('hidden'));
    }

    function toggleForm() {
      const form = document.getElementById('purchaseForm');
      const pm = document.getElementById('priceManager');
      const rep = document.getElementById('reportsSection');
      pm.classList.add('hidden');
      rep.classList.add('hidden');
      form.classList.toggle('hidden');
      showMainView(form.classList.contains('hidden'));
    }

    function toggleReports() {
      const rep = document.getElementById('reportsSection');
      const pm = document.getElementById('priceManager');
      const form = document.getElementById('purchaseForm');
      pm.classList.add('hidden');
      form.classList.add('hidden');
      rep.classList.toggle('hidden');
      if (rep.classList.contains('hidden')) {
        document.querySelectorAll('.report-tab')
            .forEach(tab => tab.classList.add('hidden'));
      }
      showMainView(rep.classList.contains('hidden'));
    }

    function switchReportTab(tabName) {
      document.querySelectorAll('.report-tab').forEach(tab => tab.classList.add('hidden'));
      
      document.getElementById('btnReportDaily').className = 'btn btn-secondary';
      document.getElementById('btnReportWeekly').className = 'btn btn-secondary';
      document.getElementById('btnReportMonthly').className = 'btn btn-secondary';
      document.getElementById('btnReportClientMonth').className = 'btn btn-secondary';
      document.getElementById('btnReportPayments').className = 'btn btn-secondary';
      document.getElementById('btnReportExpenses').className = 'btn btn-secondary';
      document.getElementById('btnReportMovements').className = 'btn btn-secondary';
      document.getElementById('btnReportAudit').className = 'btn btn-secondary';
      document.getElementById('btnReportDashboard').className = 'btn btn-secondary';


      if (tabName === 'daily') {
        document.getElementById('btnReportDaily').className = 'btn btn-info';
        loadDailyReportInline();
      } else if (tabName === 'weekly') {
        document.getElementById('btnReportWeekly').className = 'btn btn-info';
        loadWeeklyReportInline();
      } else if (tabName === 'monthly') {
        document.getElementById('btnReportMonthly').className = 'btn btn-info';
        loadMonthlyReportInline();
      } else if (tabName === 'payments') {
        document.getElementById('btnReportPayments').className = 'btn btn-success';
        loadPaymentsReportInline();
      } else if (tabName === 'expenses') {
        document.getElementById('btnReportExpenses').style.background = '#783F04';
        document.getElementById('btnReportExpenses').style.color = 'white';
        loadExpenseReportInline();
      } else if (tabName === 'movements') {
        document.getElementById('btnReportMovements').style.background = '#134F5C';
        document.getElementById('btnReportMovements').style.color = 'white';
        loadMovementsReportInline();
      } else if (tabName === 'audit') {
        document.getElementById('btnReportAudit').className = 'btn btn-info';
        loadAuditReport();
      } else if (tabName === 'dashboard') {
        document.getElementById('btnReportDashboard').className = 'btn btn-info';
        loadDashboard();
      } else if (tabName === 'clientmonth') {
        document.getElementById('btnReportClientMonth').style.background = '#6A1B9A';
        document.getElementById('btnReportClientMonth').style.color = 'white';
        initClientMonthReport();
      }   
      
      const targetTab = document.getElementById('report' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
      if(targetTab) targetTab.classList.remove('hidden');
    }

    function openCashModal() {
      document.getElementById('cashModal').style.display = 'block';
      loadCashStatus();
    }

    function closeCashModalElement() {
      document.getElementById('cashModal').style.display = 'none';
    }

    function loadCashStatus() {
      const container = document.getElementById('cashModalBody');
      container.innerHTML = '<div class="loading">Consultando estado de caja...</div>';
      const today = getServerDate();

      db.collection('CajaChica').where('fecha', '==', today).get().then((querySnapshot) => {
        let cajaDoc = null;
        let cajaId = null;
        querySnapshot.forEach(doc => {
          cajaId = doc.id;
          cajaDoc = doc.data();
        });

        const isOpen = cajaDoc && cajaDoc.estado === 'ABIERTA';
        const openingAmount = cajaDoc ? parseFloat(cajaDoc.apertura) || 0 : 0;

        db.collection('Compras').where('paid', '==', true).get().then(purchasesSnap => {
          let totalPayments = 0;
          purchasesSnap.forEach(doc => {
            const p = doc.data();
            if (p.paymentDate === today && (!p.paymentMethod || p.paymentMethod === 'Efectivo')) {
              totalPayments += parseFloat(p.total) || 0;
            }
          });

          db.collection('Gastos').where('fecha', '==', today).get().then(expensesSnap => {
            let totalExpenses = 0;
            expensesSnap.forEach(doc => {
              totalExpenses += parseFloat(doc.data().monto) || 0;
            });

            db.collection('MovimientosCaja').where('fecha', '==', today).get().then(movSnap => {
              let totalInjections = 0;
              movSnap.forEach(doc => {
                totalInjections += parseFloat(doc.data().monto) || 0;
              });

              const expectedCash = openingAmount + totalInjections - totalPayments - totalExpenses;

              if (!isOpen) {
                container.innerHTML = `
                  <div class="alert alert-info">La caja del día de hoy aún no ha sido aperturada.</div>
                  <div class="form-group">
                    <label>Efectivo Inicial en Caja (Q):</label>
                    <input type="number" id="openingCashAmount" step="0.01" placeholder="0.00" style="width:100%; padding:10px; margin-top:5px;">
                  </div>
                  <button class="btn btn-success" style="width:100%; margin-top:15px;" onclick="submitOpenCash()">🔓 Abrir Caja</button>
                `;
              } else {
                container.innerHTML = `
                  <div style="background: #E8F5E9; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                    <p><strong>Estado:</strong> 🟢 Caja Abierta</p>
                    <p><strong>Efectivo de Apertura:</strong> Q${openingAmount.toFixed(2)}</p>
                    <p style="color: #006064;"><strong>(+) Ingresos de Efectivo:</strong> Q${totalInjections.toFixed(2)}</p>
                    <p><strong>(-) Pagos de Compras:</strong> Q${totalPayments.toFixed(2)}</p>
                    <p><strong>(-) Total de Gastos:</strong> Q${totalExpenses.toFixed(2)}</p>
                    <hr style="margin: 10px 0; border:0; border-top:1px solid #c8e6c9;">
                    <p style="font-size: 16px; font-weight: bold; color: #2E7D32;">Efectivo Esperado en Caja: Q${expectedCash.toFixed(2)}</p>
                  </div>
                  <div class="form-group">
                    <label>Efectivo Real Contado al Cierre (Q):</label>
                    <input type="number" id="closingCashAmount" step="0.01" placeholder="0.00" style="width:100%; padding:10px; margin-top:5px;">
                  </div>
                  <button class="btn btn-primary" style="width:100%; margin-top:15px;" onclick="submitCloseCash('${cajaId}', ${expectedCash})">🔒 Realizar Cierre Diario</button>
                `;
              }
            });
          });
        });
      });
    }

    function submitOpenCash() {
      const amount = parseFloat(document.getElementById('openingCashAmount').value);
      if (isNaN(amount) || amount < 0) {
        alert('Por favor ingrese un monto inicial válido.');
        return;
      }
      db.collection('CajaChica').add({
        fecha: getServerDate(),
        apertura: amount,
        estado: 'ABIERTA',
        usuario: currentUser || 'Admin'
      }).then(() => {
        registrarAuditoria(
        'Caja abierta',
        'CajaChica',
        `Apertura Q${amount}`
        );
        alert('✅ Caja chica aperturada exitosamente.');
        loadCashStatus();
      });
    }

    function submitCloseCash(cajaId, expectedCash) {
      const realCash = parseFloat(document.getElementById('closingCashAmount').value);
      if (isNaN(realCash) || realCash < 0) {
        alert('Por favor ingrese el efectivo real contado.');
        return;
      }
      db.collection('CajaChica').doc(cajaId).update({
        efectivoEsperado: expectedCash,
        efectivoReal: realCash,
        estado: 'CERRADA'
      }).then(() => {
        registrarAuditoria(
        'Caja cerrada',
        'CajaChica',
        `Esperado Q${expectedCash.toFixed(2)} | Real Q${realCash.toFixed(2)}`
        );
        alert('✅ Caja cerrada correctamente.');
        closeCashModalElement();
      });
    }

    function openCashInjectionModal() {
      document.getElementById('injectionAmount').value = '';
      document.getElementById('injectionDesc').value = '';
      document.getElementById('cashInjectionModal').style.display = 'block';
    }

    function closeCashInjectionModalElement() {
      document.getElementById('cashInjectionModal').style.display = 'none';
    }

    function submitCashInjection() {
      const amount = parseFloat(document.getElementById('injectionAmount').value);
      const description = document.getElementById('injectionDesc').value;
      if (isNaN(amount) || amount <= 0) {
        alert('Por favor ingrese un monto válido.');
        return;
      }
      db.collection('MovimientosCaja').add({
        fecha: getServerDate(),
        tipo: 'Ingreso de Efectivo',
        monto: amount,
        descripcion: description,
        usuario: currentUser || 'Admin'
      }).then(() => {
        registrarAuditoria(
        'Ingreso de efectivo',
        'Caja',
        `Q${amount} - ${description}`
        );
        alert('✅ Ingreso de efectivo registrado.');
        closeCashInjectionModalElement();
        loadData();
      });
    }

    function openExpenseModal() {
      document.getElementById('expenseAmount').value = '';
      document.getElementById('expenseDesc').value = '';
      document.getElementById('expenseModal').style.display = 'block';
    }

    function closeExpenseModalElement() {
      document.getElementById('expenseModal').style.display = 'none';
    }

    function submitExpense() {
      const rubro = document.getElementById('expenseCategory').value;
      const amount = parseFloat(document.getElementById('expenseAmount').value);
      const description = document.getElementById('expenseDesc').value;
      if (isNaN(amount) || amount <= 0) {
        alert('Por favor ingrese un monto válido.');
        return;
      }
      db.collection('Gastos').add({
        fecha: getServerDate(),
        rubro: rubro,
        monto: amount,
        descripcion: description,
        usuario: currentUser || 'Admin'
      }).then(() => {
        registrarAuditoria(
        'Gasto registrado',
        rubro,
        `Q${amount} - ${description}`
        );
        alert('✅ Gasto registrado.');
        closeExpenseModalElement();
        loadData();
      });
    }

    function loadDailyReportInline() {
      const date = document.getElementById('reportDailyDate').value;
      const results = document.getElementById('reportDailyResults');
      if (!date || !results) return;
      results.innerHTML = '<p style="text-align:center; padding:20px;">Cargando...</p>';

      db.collection('Compras').where('date', '==', date).get().then(snapshot => {
        let purchases = [];
        let totalAmount = 0;
        let totalQty = 0;
        let totalProfit = 0;

        snapshot.forEach(doc => {
          let p = doc.data();
          totalQty += parseFloat(p.quantity) || 0;
          if (p.paid) {
            totalAmount += parseFloat(p.total) || 0;
            totalProfit += parseFloat(p.profit) || 0;
          }
          purchases.push({
            ...p,
            quantityDisplay: (p.quantity || 0) + ' ' + (p.unit || 'quintales'),
            totalDisplay: 'Q' + (p.total || 0).toFixed(2),
          });
        });

        if (purchases.length === 0) {
          results.innerHTML = '<p style="text-align:center; padding:20px; color:#666;">No hay compras en esta fecha.</p>';
          return;
        }

        let html = `
          <div class="stats" style="margin: 15px 0;">
            <div class="stat-card">
              <div class="stat-label">Quintales Día</div>
              <div class="stat-value" style="color: #D84315;">${totalQty.toFixed(2)} qq</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Total Pagado</div>
              <div class="stat-value" style="color: #388E3C;">Q${totalAmount.toFixed(2)}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Ganancia</div>
              <div class="stat-value" style="color: #1976D2;">Q${totalProfit.toFixed(2)}</div>
            </div>
          </div>
          <div class="table-container">
            <table>
              <thead>
                <tr><th>Recibo</th><th>Cliente</th><th>Tipo</th><th>Cantidad</th><th>Total</th><th>Estado</th></tr>
              </thead>
              <tbody>
        `;
        purchases.forEach(p => {
          html += `<tr><td>${p.receiptNumber}</td><td><b>${p.clientName}</b></td><td>${p.coffeeType}</td><td>${p.quantityDisplay}</td><td><b>${p.totalDisplay}</b></td><td><span class="badge ${p.paid ? 'badge-success' : 'badge-danger'}">${p.paid ? 'Pagado' : 'Pendiente'}</span></td></tr>`;
        });
        html += `</tbody></table></div>`;
        results.innerHTML = html;
      });
    }

    function loadPaymentsReportInline() {
      const date = document.getElementById('reportPaymentsDate').value;
      const results = document.getElementById('reportPaymentsResults');
      if (!date || !results) return;
      results.innerHTML = '<p style="text-align:center; padding:20px;">Cargando pagos...</p>';

      db.collection('Compras').where('paymentDate', '==', date).where('paid', '==', true).get().then(snapshot => {
        currentPaymentData = [];
        snapshot.forEach(doc => {
          let p = doc.data();
          currentPaymentData.push({
            ...p,
            quantityDisplay: (p.quantity || 0) + ' ' + (p.unit || 'quintales'),
            pricePerQuintalDisplay: 'Q' + (p.pricePerQuintal || 0).toFixed(2),
            totalDisplay: 'Q' + (p.total || 0).toFixed(2),
            paymentDateDisplay: formatDateForDisplay(p.paymentDate)
          });
        });
        renderPaymentsReport(currentPaymentData);
      });
    }

    function filterPaymentsReport() {
      const query = document.getElementById('reportPaymentsSearch').value.toLowerCase();
      const filtered = currentPaymentData.filter(p => 
        p.clientName.toLowerCase().includes(query) || 
        p.receiptNumber.toLowerCase().includes(query)
      );
      renderPaymentsReport(filtered);
    }

    function renderPaymentsReport(payments) {
      const results = document.getElementById('reportPaymentsResults');
      if (!results) return;
      if (payments.length === 0) {
        results.innerHTML = '<p style="text-align:center; padding:20px; color:#666;">No hay pagos registrados.</p>';
        return;
      }
      let totalPaidSum = 0;
      let html = `<div class="table-container" style="margin-top:15px;"><table><thead><tr><th>Recibo</th><th>Cliente</th><th>Tipo</th><th>Cantidad</th><th>Precio/qq</th><th>Total</th><th>Comentario</th><th>Fecha</th></tr></thead><tbody>`;
      payments.forEach(p => {
        totalPaidSum += (p.total || 0);
        html += `<tr><td>${p.receiptNumber}</td><td><b>${p.clientName}</b></td><td>${p.coffeeType}</td><td>${p.quantityDisplay}</td><td>${p.pricePerQuintalDisplay}</td><td style="color:#388E3C; font-weight:bold;">${p.totalDisplay}</td><td>${p.comment || '-'}</td><td>${p.paymentDateDisplay}</td></tr>`;
      });
      html += `</tbody></table></div><div style="margin-top:15px; padding:15px; background:#E8F5E9; border-radius:8px;"><p style="font-size:16px; font-weight:bold; color:#2E7D32;">Total Pagado: Q${totalPaidSum.toFixed(2)}</p></div>`;
      if (p.comment) {
		  html += `<br><p><strong>Observaciones:</strong></p><p>${p.comment}</p>
        `;}  
      results.innerHTML = html;
    }

    function loadExpenseReportInline() {
      const year = document.getElementById('reportExpenseYear').value;
      const month = document.getElementById('reportExpenseMonth').value;
      const results = document.getElementById('reportExpenseResults');
      if (!year || !month || !results) return;
      results.innerHTML = '<p style="text-align:center; padding:20px;">Cargando gastos...</p>';

      db.collection('Gastos').get().then(snapshot => {
        let totalExpenses = 0;
        let expensesList = [];
        const monthNames = [null, 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

        snapshot.forEach(doc => {
          let e = doc.data();
          if (!e.fecha) return;
          const parts = e.fecha.split('-');
          if (parseInt(parts[0]) === parseInt(year) && parseInt(parts[1]) === parseInt(month)) {
            totalExpenses += parseFloat(e.monto) || 0;
            expensesList.push({
              date: formatDateForDisplay(e.fecha),
              rubro: e.rubro || 'Varios',
              amount: parseFloat(e.monto) || 0,
              description: e.descripcion || '-'
            });
          }
        });

        if (expensesList.length === 0) {
          results.innerHTML = `<p style="text-align:center; padding:20px; color:#666;">No hay gastos en ${monthNames[parseInt(month)]} ${year}.</p>`;
          return;
        }

        let html = `<h4 style="margin-bottom:10px;">Gastos: ${monthNames[parseInt(month)]} ${year} (Total: Q${totalExpenses.toFixed(2)})</h4><div class="table-container"><table><thead><tr><th>Fecha</th><th>Rubro</th><th>Monto</th><th>Descripción</th></tr></thead><tbody>`;
        expensesList.forEach(e => {
          html += `<tr><td>${e.date}</td><td>${e.rubro}</td><td style="color:#C62828; font-weight:bold;">Q${e.amount.toFixed(2)}</td><td>${e.description}</td></tr>`;
        });
        html += `</tbody></table></div>`;
        results.innerHTML = html;
      });
    }

    function loadMovementsReportInline() {
      const date = document.getElementById('reportMovementsDate').value;
      const results = document.getElementById('reportMovementsResults');
      if (!date || !results) return;
      results.innerHTML = '<p style="text-align:center; padding:20px;">Cargando...</p>';

      db.collection('MovimientosCaja').where('fecha', '==', date).get().then(snapshot => {
        let movements = [];
        let totalSum = 0;
        snapshot.forEach(doc => {
          let m = doc.data();
          totalSum += parseFloat(m.monto) || 0;
          movements.push({
            date: formatDateForDisplay(m.fecha),
            type: m.tipo,
            amount: parseFloat(m.monto) || 0,
            description: m.descripcion || '-'
          });
        });

        if (movements.length === 0) {
          results.innerHTML = '<p style="text-align:center; padding:20px; color:#666;">No hay movimientos en esta fecha.</p>';
          return;
        }

        let html = `<h4 style="margin-bottom:10px;">Ingresos (Total: Q${totalSum.toFixed(2)})</h4><div class="table-container"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Monto</th><th>Descripción</th></tr></thead><tbody>`;
        movements.forEach(m => {
          html += `<tr><td>${m.date}</td><td>${m.type}</td><td style="color:#00838F; font-weight:bold;">Q${m.amount.toFixed(2)}</td><td>${m.description}</td></tr>`;
        });
        html += `</tbody></table></div>`;
        results.innerHTML = html;
      });
    }

    function loadYearOptions() {
      const yearSelect = document.getElementById('reportMonthlyYear');
      const expYearSelect = document.getElementById('reportExpenseYear');
      const currentYear = new Date().getFullYear();
      [yearSelect, expYearSelect].forEach(sel => {
        if (!sel) return;
        sel.innerHTML = '';
        for (let i = currentYear; i >= 2023; i--) {
          const opt = document.createElement('option');
          opt.value = i;
          opt.textContent = i;
          if (i === currentYear) opt.selected = true;
          sel.appendChild(opt);
        }
      });
      const monthSelect = document.getElementById('reportMonthlyMonth');
      if (monthSelect) monthSelect.value = new Date().getMonth() + 1;
      const expMonthSelect = document.getElementById('reportExpenseMonth');
      if (expMonthSelect) expMonthSelect.value = new Date().getMonth() + 1;
    }

    function filterPurchases() {
      const filterClient = document.getElementById('filterClient').value;
      const searchTerm = document.getElementById('searchTerm').value.toLowerCase();
      filteredPurchases = allPurchases.filter(p => {
        const matchesClient = !filterClient || p.clientName === filterClient;
        const matchesSearch = !searchTerm || p.clientName.toLowerCase().includes(searchTerm) || p.receiptNumber.toLowerCase().includes(searchTerm);
        return matchesClient && matchesSearch;
      });
      renderPurchases();
    }

    function savePurchase() {
      const clientName = document.getElementById('clientName').value.trim();
      const purchaseDate = document.getElementById('purchaseDate').value;
      const coffeeType = document.getElementById('coffeeType').value;
      const quantity = parseFloat(document.getElementById('quantity').value);
      const unit = document.getElementById('unit').value;

      if (!clientName || !purchaseDate || isNaN(quantity) || quantity <= 0) {
        alert('Complete todos los campos correctamente.');
        return;
      }

      const receiptNumber = 'RCP-' + Math.floor(100000000 + Math.random() * 900000000);
      
      db.collection('Compras').add({
        receiptNumber, clientName, date: purchaseDate, coffeeType, quantity, unit: unit || 'quintales',
        pricePerQuintal: 0, benefitPrice: 0, total: 0, profit: 0, paid: false, paymentDate: '', comment: '', user: currentUser || 'Admin', paymentMethod: 'Efectivo'
      }).then(() => {
        registrarAuditoria(
        'Compra registrada',
        receiptNumber,
        `${clientName} - ${coffeeType} - ${quantity} ${unit}`
        );
        document.getElementById('confReceiptNumber').textContent = receiptNumber;
        document.getElementById('printConfirmModal').style.display = 'block';
        toggleForm();
        loadData();
      });
    }

    function closePrintConfirmModal() {
      document.getElementById('printConfirmModal').style.display = 'none';
    }

    function printConfirmedReceipt() {
      const recNum = document.getElementById('confReceiptNumber').textContent;
      closePrintConfirmModal();
      printReceipt(recNum);
    }

    function openPaymentModal(purchaseId) {
      selectedPurchase = allPurchases.find(p => p.id === purchaseId);
      if (!selectedPurchase) return;
      const pPrice = currentPrices[selectedPurchase.coffeeType] ? currentPrices[selectedPurchase.coffeeType].purchasePrice : 0;
      document.getElementById('paymentDetails').innerHTML = `<p><strong>Recibo:</strong> ${selectedPurchase.receiptNumber}</p><p><strong>Cliente:</strong> ${selectedPurchase.clientName}</p>`;
      document.getElementById('paymentPrice').value = pPrice;
      document.getElementById('paymentComment').value = '';
      calculatePaymentTotal();
      document.getElementById('paymentModal').style.display = 'block';
    }

    function closePaymentModal() {
      document.getElementById('paymentModal').style.display = 'none';
      selectedPurchase = null;
    }

    function calculatePaymentTotal() {
      if (!selectedPurchase) return;
      const price = parseFloat(document.getElementById('paymentPrice').value) || 0;
      const total = price * selectedPurchase.quantity;
      document.getElementById('totalAmount').textContent = 'Q' + total.toFixed(2);
      document.getElementById('paymentTotal').classList.remove('hidden');
    }

    function confirmPayment() {
      if (!selectedPurchase) return;
      const price = parseFloat(document.getElementById('paymentPrice').value);
      const paymentMethod = document.getElementById('paymentMethod').value;
      const comment = document.getElementById('paymentComment').value;
      if (isNaN(price) || price < 0) {
        alert('Ingrese un precio válido.');
        return;
      }
      const benefitPrice = currentPrices[selectedPurchase.coffeeType] ? currentPrices[selectedPurchase.coffeeType].benefitPrice : price;
      const total = price * selectedPurchase.quantity;
      const profit = (benefitPrice - price) * selectedPurchase.quantity;

      db.collection('Compras').doc(selectedPurchase.id).update({
        pricePerQuintal: price, benefitPrice, total, profit, paid: true, paymentDate: getServerDate(), comment, paymentMethod
      }).then(() => {
        registrarAuditoria(
        'Pago realizado',
        selectedPurchase.receiptNumber,
        `Total Q${total.toFixed(2)} - ${paymentMethod}`
        );
        alert('✅ Pago registrado.');
        closePaymentModal();
        loadData();
      });
    }

    function printReceipt(receiptNumber) {
      const p = allPurchases.find(item => item.receiptNumber === receiptNumber);
      if (!p) return;
      const logoUrl = 'https://lh3.googleusercontent.com/d/12r5Tple_rioInO71lUVqrkpVeoft77Ei';
      let html = `<div style="text-align: center;"><img src="${logoUrl}" style="max-width: 50mm; height: auto;"><h3 style="font-size:12px;">Fraijanes</h3></div><p><strong>Recibo:</strong> ${p.receiptNumber}</p><p><strong>Cliente:</strong> ${p.clientName}</p><p><strong>Cantidad:</strong> ${p.quantity} ${p.unit}</p><p><strong>Total:</strong> Q${(p.total||0).toFixed(2)}</p>`;
      document.getElementById('ticketDetails').innerHTML = html;
      document.getElementById('thermalTicketModal').style.display = 'block';
    }

    function closeThermalTicketModal() {
      document.getElementById('thermalTicketModal').style.display = 'none';
    }

    function openBatchPayment() {
      const pendingPurchases = allPurchases.filter(p => !p.paid);
      if (pendingPurchases.length === 0) {
        alert('No hay compras pendientes.');
        return;
      }
      const clientName = pendingPurchases[0].clientName;
      const clientPending = pendingPurchases.filter(p => p.clientName === clientName);
      document.getElementById('batchClient').textContent = `${clientName} (${clientPending.length} compras)`;
      let html = '';
      let totalSum = 0;
      clientPending.forEach(p => {
        const pPrice = currentPrices[p.coffeeType] ? currentPrices[p.coffeeType].purchasePrice : 0;
        const subtotal = pPrice * p.quantity;
        totalSum += subtotal;
        html += `<div class="batch-payment-item" data-id="${p.id}"><p>Recibo: ${p.receiptNumber} - ${p.quantity} ${p.unit}</p><input type="number" step="0.01" value="${pPrice.toFixed(2)}" class="batch-price-input" data-id="${p.id}" data-qty="${p.quantity}" oninput="updateBatchTotal()" style="width:100%;"></div>`;
      });
      document.getElementById('batchPaymentList').innerHTML = html;
      document.getElementById('batchTotalAmount').textContent = 'Q' + totalSum.toFixed(2);
      document.getElementById('batchPaymentModal').style.display = 'block';
    }

    function updateBatchTotal() {
      let totalSum = 0;
      document.querySelectorAll('.batch-payment-item').forEach(item => {
        const input = item.querySelector('.batch-price-input');
        totalSum += (parseFloat(input.getAttribute('data-qty')) || 0) * (parseFloat(input.value) || 0);
      });
      document.getElementById('batchTotalAmount').textContent = 'Q' + totalSum.toFixed(2);
    }

    function closeBatchPaymentModal() {
      document.getElementById('batchPaymentModal').style.display = 'none';
    }

    function confirmBatchPayment() {
      const items = document.querySelectorAll('.batch-payment-item');
      if (items.length === 0) return;
      let batch = db.batch();
      items.forEach(item => {
        const input = item.querySelector('.batch-price-input');
        const id = input.getAttribute('data-id');
        const price = parseFloat(input.value) || 0;
        const p = allPurchases.find(x => x.id === id);
        if (p) {
          const benefitPrice = currentPrices[p.coffeeType] ? currentPrices[p.coffeeType].benefitPrice : price;
          batch.update(db.collection('Compras').doc(id), {
            pricePerQuintal: price, benefitPrice, total: price * p.quantity, profit: (benefitPrice - price) * p.quantity, paid: true, paymentDate: getServerDate(), paymentMethod: 'Efectivo'
          });
        }
      });
      batch.commit().then(() => {
        alert('✅ Pago por lotes exitoso.');
        closeBatchPaymentModal();
        loadData();
      });
    }

    function loadCurrentWeekInline() {
      const now = new Date();
      currentWeekStartInline = new Date(now.setDate(now.getDate() - now.getDay() + 1));
      loadWeeklyReportInline();
    }

    function changeWeekInline(direction) {
      if (!currentWeekStartInline) currentWeekStartInline = new Date();
      currentWeekStartInline.setDate(currentWeekStartInline.getDate() + (direction * 7));
      loadWeeklyReportInline();
    }

    function loadWeeklyReportInline() {
      if (!currentWeekStartInline) currentWeekStartInline = new Date();
      const start = new Date(currentWeekStartInline);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      const startStr = start.toISOString().split('T')[0];
      const endStr = end.toISOString().split('T')[0];

      const weekDisplay = document.getElementById('weekDisplayInline');
      if (weekDisplay) {
        weekDisplay.textContent = `${formatDateForDisplay(startStr)} al ${formatDateForDisplay(endStr)}`;
      }
      const results = document.getElementById('reportWeeklyResults');
      if (!results) return;
      results.innerHTML = '<p style="text-align:center; padding:20px;">Cargando...</p>';

      db.collection('Compras').get().then(snapshot => {
        let weeklyPurchases = [];
        let totalQty = 0, totalPaid = 0, totalProfit = 0;
        snapshot.forEach(doc => {
          let p = doc.data();
          if (p.date >= startStr && p.date <= endStr) {
            totalQty += parseFloat(p.quantity) || 0;
            if (p.paid) {
              totalPaid += parseFloat(p.total) || 0;
              totalProfit += parseFloat(p.profit) || 0;
            }
            weeklyPurchases.push({ ...p, quantityDisplay: `${p.quantity || 0} ${p.unit || 'quintales'}`, totalDisplay: `Q${(p.total || 0).toFixed(2)}`, dateDisplay: formatDateForDisplay(p.date) });
          }
        });

        if (weeklyPurchases.length === 0) {
          results.innerHTML = '<p style="text-align:center; padding:20px; color:#666;">No hay compras en esta semana.</p>';
          return;
        }

        let html = `<div class="stats" style="margin-bottom:15px;"><div class="stat-card"><div class="stat-label">Quintales Semana</div><div class="stat-value" style="color:#D84315;">${totalQty.toFixed(2)} qq</div></div><div class="stat-card"><div class="stat-label">Monto Pagado</div><div class="stat-value" style="color:#388E3C;">Q${totalPaid.toFixed(2)}</div></div><div class="stat-card"><div class="stat-label">Ganancia</div><div class="stat-value" style="color:#1976D2;">Q${totalProfit.toFixed(2)}</div></div></div><div class="table-container"><table><thead><tr><th>Fecha</th><th>Recibo</th><th>Cliente</th><th>Tipo</th><th>Cantidad</th><th>Total</th><th>Estado</th></tr></thead><tbody>`;
        weeklyPurchases.forEach(p => {
          html += `<tr><td>${p.dateDisplay}</td><td>${p.receiptNumber}</td><td><b>${p.clientName}</b></td><td>${p.coffeeType}</td><td>${p.quantityDisplay}</td><td><b>${p.totalDisplay}</b></td><td><span class="badge ${p.paid ? 'badge-success' : 'badge-danger'}">${p.paid ? 'Pagado' : 'Pendiente'}</span></td></tr>`;
        });
        html += `</tbody></table></div>`;
        results.innerHTML = html;
      });
    }

    function loadMonthlyReportInline() {
      const yearSelect = document.getElementById('reportMonthlyYear');
      const monthSelect = document.getElementById('reportMonthlyMonth');
      const results = document.getElementById('reportMonthlyResults');
      if (!yearSelect || !monthSelect || !results) return;

      const year = yearSelect.value;
      const month = monthSelect.value;
      results.innerHTML = '<p style="text-align:center; padding:20px;">Cargando...</p>';

      db.collection('Compras').get().then(snapshot => {
        let monthlyPurchases = [];
        let totalQty = 0, totalPaid = 0, totalProfit = 0;
        const monthNames = [null, 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

        snapshot.forEach(doc => {
          let p = doc.data();
          if (!p.date) return;
          const parts = p.date.split('-');
          if (parseInt(parts[0]) === parseInt(year) && parseInt(parts[1]) === parseInt(month)) {
            totalQty += parseFloat(p.quantity) || 0;
            if (p.paid) {
              totalPaid += parseFloat(p.total) || 0;
              totalProfit += parseFloat(p.profit) || 0;
            }
            monthlyPurchases.push({ ...p, quantityDisplay: `${p.quantity || 0} ${p.unit || 'quintales'}`, totalDisplay: `Q${(p.total || 0).toFixed(2)}`, dateDisplay: formatDateForDisplay(p.date) });
          }
        });

        if (monthlyPurchases.length === 0) {
          results.innerHTML = `<p style="text-align:center; padding:20px; color:#666;">No hay compras en ${monthNames[parseInt(month)]} ${year}.</p>`;
          return;
        }

        let html = `<h4 style="margin-bottom:15px;">Reporte Mensual: ${monthNames[parseInt(month)]} ${year}</h4><div class="stats" style="margin-bottom:15px;"><div class="stat-card"><div class="stat-label">Quintales Mes</div><div class="stat-value" style="color:#D84315;">${totalQty.toFixed(2)} qq</div></div><div class="stat-card"><div class="stat-label">Monto Pagado</div><div class="stat-value" style="color:#388E3C;">Q${totalPaid.toFixed(2)}</div></div><div class="stat-card"><div class="stat-label">Ganancia</div><div class="stat-value" style="color:#1976D2;">Q${totalProfit.toFixed(2)}</div></div></div><div class="table-container"><table><thead><tr><th>Fecha</th><th>Recibo</th><th>Cliente</th><th>Tipo</th><th>Cantidad</th><th>Total</th><th>Estado</th></tr></thead><tbody>`;
        monthlyPurchases.forEach(p => {
          html += `<tr><td>${p.dateDisplay}</td><td>${p.receiptNumber}</td><td><b>${p.clientName}</b></td><td>${p.coffeeType}</td><td>${p.quantityDisplay}</td><td><b>${p.totalDisplay}</b></td><td><span class="badge ${p.paid ? 'badge-success' : 'badge-danger'}">${p.paid ? 'Pagado' : 'Pendiente'}</span></td></tr>`;
        });
        html += `</tbody></table></div>`;
        results.innerHTML = html;
      });
    }
    function loadAuditReport() {
            const results =
                document.getElementById('reportAuditResults');
            results.innerHTML =
                '<p style="padding:20px;text-align:center;">Cargando...</p>';
            const userFilter =
                document.getElementById('auditSearchUser')
                    .value
                    .toLowerCase();
            const actionFilter =
                document.getElementById('auditSearchAction')
                    .value
                    .toLowerCase();
            db.collection('Auditoria')
            .orderBy('timestamp', 'desc')
            .limit(300)
            .get()
            .then(snapshot => {
                let html = `
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>Hora</th>
                                <th>Usuario</th>
                                <th>Acción</th>
                                <th>Documento</th>
                                <th>Detalle</th>
                            </tr>
                        </thead>
                        <tbody>
                `;
                let registros = 0;
                snapshot.forEach(doc => {
                    const a = doc.data();
                    const usuario =
                        (a.usuario || '').toLowerCase();
                    const accion =
                        (a.accion || '').toLowerCase();
                    if (
                        userFilter &&
                        !usuario.includes(userFilter)
                    ) return;
                    if (
                        actionFilter &&
                        !accion.includes(actionFilter)
                    ) return;
                    registros++;
                    html += `
                    <tr>
                        <td>${a.fecha || ''}</td>
                        <td>${a.hora || ''}</td>
                        <td><b>${a.usuario || ''}</b></td>
                        <td>${a.accion || ''}</td>
                        <td>${a.documento || ''}</td>
                        <td>${a.detalle || ''}</td>
                    </tr>
                    `;
                });
                if (registros === 0) {
                    html += `
                    <tr>
                        <td colspan="6"
                            style="text-align:center;">
                            No hay registros
                        </td>
                    </tr>
                    `;
                }
                html += `
                        </tbody>
                    </table>
                </div>
                `;
                results.innerHTML = html;
            });
    }
    function exportPurchasesExcel() {
        const data = allPurchases.map(p => ({
            Recibo: p.receiptNumber,
            Cliente: p.clientName,
            TipoCafe: p.coffeeType,
            Cantidad: p.quantity,
            Unidad: p.unit,
            PrecioCompra: p.pricePerQuintal,
            PrecioBeneficio: p.benefitPrice,
            Total: p.total,
            Ganancia: p.profit,
            Estado: p.paid ? 'Pagado' : 'Pendiente',
            FechaCompra: p.date,
            FechaPago: p.paymentDate,
            Usuario: p.user
        }));
        const worksheet =
            XLSX.utils.json_to_sheet(data);
        const workbook =
            XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(
            workbook,
            worksheet,
            "Compras"
        );
        const fecha =
            getServerDate();
        XLSX.writeFile(
            workbook,
            `Compras_${fecha}.xlsx`
        );
    }
    
    function loadDashboard() {
        console.log("Dashboard ejecutado");
        let totalQty = 0;
        let totalPaid = 0;
        let totalProfit = 0;
        const tiposCafe = {};
        allPurchases.forEach(p => {
            totalQty += parseFloat(p.quantity) || 0;
            if (p.paid) {
                totalPaid += parseFloat(p.total) || 0;
                totalProfit += parseFloat(p.profit) || 0;
            }
            const tipo = p.coffeeType || 'Sin Tipo';
            tiposCafe[tipo] =
                (tiposCafe[tipo] || 0) +
                (parseFloat(p.quantity) || 0);
        });
        document.getElementById('dashboardQty')
            .textContent = totalQty.toFixed(2);
        document.getElementById('dashboardPaid')
            .textContent = 'Q' + totalPaid.toFixed(2);
        document.getElementById('dashboardProfit')
            .textContent = 'Q' + totalProfit.toFixed(2);
        const labels = Object.keys(tiposCafe);
        const values = Object.values(tiposCafe);
        const ctx =
            document.getElementById('coffeeTypeChart');
        if (!ctx) return;
        if (coffeeTypeChart) {
            coffeeTypeChart.destroy();
        }
        coffeeTypeChart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: [
                        '#D84315',
                        '#388E3C',
                        '#1976D2',
                        '#FF6F00',
                        '#7B1FA2',
                        '#5D4037'
                    ]
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Distribución por Tipo de Café'
                    },
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });  
        const proveedores = {};
        allPurchases.forEach(p => {
            proveedores[p.clientName] =
                (proveedores[p.clientName] || 0)
                + (parseFloat(p.quantity) || 0);
        });
        const top10 = Object.entries(proveedores)
            .sort((a,b) => b[1] - a[1])
            .slice(0,10);
        let html = `
        <table>
            <thead>
                <tr>
                    <th>Proveedor</th>
                    <th>Quintales</th>
                </tr>
            </thead>
            <tbody>
        `;
        top10.forEach(item => {
            html += `
            <tr>
                <td>${item[0]}</td>
                <td>
                    <b>${item[1].toFixed(2)}</b>
                </td>
            </tr>
            `;
        });
        html += `
            </tbody>
        </table>
        `;
        document.getElementById(
            'topProvidersTable'
        ).innerHTML = html;  
    }
    
    function initClientMonthReport() {
        const yearSelect =
            document.getElementById(
                'clientMonthYear'
            );
        const clientSelect =
            document.getElementById(
                'clientMonthClient'
            );
        if (!yearSelect || !clientSelect)
            return;
        yearSelect.innerHTML = '';
        const currentYear =
            new Date().getFullYear();
        for(let y=currentYear; y>=2023; y--) {
            const opt =
                document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            yearSelect.appendChild(opt);
        }
        clientSelect.innerHTML =
            '<option value="">Seleccione Cliente</option>';
        allClients.forEach(client => {
            const opt =
                document.createElement('option');
            opt.value = client;
            opt.textContent = client;
            clientSelect.appendChild(opt);
        });
    }

    function loadClientMonthReport() {
        const year =
            document.getElementById(
                'clientMonthYear'
            ).value;
        const month =
            document.getElementById(
                'clientMonthMonth'
            ).value;
        const client =
            document.getElementById(
                'clientMonthClient'
            ).value;
        if (!year || !month || !client)
            return;
        const compras =
            allPurchases.filter(p => {
                if (p.clientName !== client)
                    return false;
                if (!p.date)
                    return false;
                const parts =
                    p.date.split('-');
                return (
                    parseInt(parts[0]) === parseInt(year)
                    &&
                    parseInt(parts[1]) === parseInt(month)
                );
            });
        let totalQty = 0;
        let totalPaid = 0;
        let totalProfit = 0;
        compras.forEach(c => {
            totalQty +=
                parseFloat(c.quantity) || 0;
            totalPaid +=
                parseFloat(c.total) || 0;
            totalProfit +=
                parseFloat(c.profit) || 0;
        });
        let html = `
            <div class="stats">
                <div class="stat-card">
                    <div class="stat-label">
                        Compras
                    </div>
                    <div class="stat-value">
                        ${compras.length}
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">
                        Quintales
                    </div>
                    <div class="stat-value"
                        style="color:#D84315;">
                        ${totalQty.toFixed(2)}
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">
                        Total Pagado
                    </div>
                    <div class="stat-value"
                        style="color:#388E3C;">
                        Q${totalPaid.toFixed(2)}
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">
                        Ganancia
                    </div>
                    <div class="stat-value"
                        style="color:#1976D2;">
                        Q${totalProfit.toFixed(2)}
                    </div>
                </div>
            </div>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Recibo</th>
                            <th>Tipo</th>
                            <th>Cantidad</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        compras.forEach(c => {
            html += `
                <tr>
                    <td>${c.dateDisplay}</td>
                    <td>${c.receiptNumber}</td>
                    <td>${c.coffeeType}</td>
                    <td>${c.quantityDisplay}</td>
                    <td>${c.totalDisplay}</td>
                </tr>
            `;
        });
        html += `
                </tbody>
            </table>
        </div>
        `;
        document.getElementById(
            'clientMonthResults'
        ).innerHTML = html;
    }

    function exportClientMonthExcel() {
        const year =
            document.getElementById('clientMonthYear').value;
        const month =
            document.getElementById('clientMonthMonth').value;
        const client =
            document.getElementById('clientMonthClient').value;
        if (!year || !month || !client) {
            alert('Seleccione año, mes y cliente.');
            return;
        }
        const compras = allPurchases.filter(p => {
            if (p.clientName !== client) return false;
            if (!p.date) return false;
            const parts = p.date.split('-');
            return (
                parseInt(parts[0]) === parseInt(year) &&
                parseInt(parts[1]) === parseInt(month)
            );
        });
        if (compras.length === 0) {
            alert('No hay datos para exportar.');
            return;
        }
        const data = compras.map(c => ({
            Fecha: c.dateDisplay,
            Recibo: c.receiptNumber,
            Cliente: c.clientName,
            TipoCafe: c.coffeeType,
            Cantidad: c.quantity,
            Unidad: c.unit,
            PrecioCompra: c.pricePerQuintal,
            PrecioBeneficio: c.benefitPrice,
            Total: c.total,
            Ganancia: c.profit,
            Estado: c.paid ? 'Pagado' : 'Pendiente',
            FechaPago: c.paymentDateDisplay || ''
        }));
        const worksheet =
            XLSX.utils.json_to_sheet(data);
        const workbook =
            XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(
            workbook,
            worksheet,
            'Cliente Mensual'
        );
        const monthNames = [
            '',
            'Enero',
            'Febrero',
            'Marzo',
            'Abril',
            'Mayo',
            'Junio',
            'Julio',
            'Agosto',
            'Septiembre',
            'Octubre',
            'Noviembre',
            'Diciembre'
        ];
        const safeClient =
            client.replace(/[^\w\s]/gi, '')
                .replace(/\s+/g, '_');
        XLSX.writeFile(
            workbook,
            `Cliente_${safeClient}_${monthNames[parseInt(month)]}_${year}.xlsx`
        );
    }
