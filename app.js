(() => {
  const $ = (q) => document.querySelector(q);
  const $$ = (q) => document.querySelectorAll(q);

  const fmt = (n) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);

  const formatDate = (d = new Date()) => {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  /* =========================
     SESIÓN (demo)
  ========================= */
  const session = JSON.parse(localStorage.getItem("demo_session") || "null");
  if (!session) {
    window.location.href = "login.html";
    return;
  }

  $("#whoami") && ($("#whoami").textContent = session.name || "Vendedor");
  $("#logoutBtn")?.addEventListener("click", () => {
    localStorage.removeItem("demo_session");
    window.location.href = "login.html";
  });

  /* =========================
     DATOS (mock inicial; se reemplaza con CSV)
  ========================= */
  const MOCK = {
    customers: [
      { id: 101, name: "Papelería López" },
      { id: 102, name: "Juan Pérez" },
      { id: 103, name: "Oficinas ABC" },
      { id: 104, name: "María García" }
    ],
    products: [
      { id: 1, code: "CAM-059", name: "Tabla agarra papel carta", prices: { menudeo: 35, mayoreo: 30, empaque: 25 }, stock: 7 },
      { id: 2, code: "PLU-001", name: "Plumón azul punta fina", prices: { menudeo: 18, mayoreo: 15, empaque: 12 }, stock: 25 }
    ]
  };

  function stockBadge(stock) {
    if (stock <= 0) return { cls: "no", text: "Sin stock" };
    if (stock <= 5) return { cls: "low", text: `Stock: ${stock}` };
    return { cls: "ok", text: `Stock: ${stock}` };
  }

  /* =========================
     PARSER CSV/TSV (Excel)
     - Detecta delimitador: TAB, ; o ,
     - Quita BOM
  ========================= */
  function parseCSV(text) {
    const clean = String(text || "").replace(/\r/g, "").trim();
    if (!clean) return [];

    const [rawHeader, ...rows] = clean.split("\n");

    const delimiter =
      rawHeader.includes("\t") ? "\t" :
      rawHeader.includes(";") ? ";" : ",";

    const header = rawHeader.replace(/^\uFEFF/, "");
    const keys = header.split(delimiter).map(k => k.trim());

    return rows
      .filter(r => r.trim().length > 0)
      .map(r => {
        const values = r.split(delimiter);
        const obj = {};

        keys.forEach((k, i) => {
          const raw = (values[i] ?? "").trim();
          const num = Number(raw);
          obj[k] = raw !== "" && !Number.isNaN(num) ? num : raw;
        });

        // prices
        if ("menudeo" in obj || "mayoreo" in obj || "empaque" in obj) {
          obj.prices = {
            menudeo: Number(obj.menudeo || 0),
            mayoreo: Number(obj.mayoreo || 0),
            empaque: Number(obj.empaque || 0)
          };
          delete obj.menudeo;
          delete obj.mayoreo;
          delete obj.empaque;
        }

        if ("id" in obj) obj.id = Number(obj.id);
        if ("stock" in obj) obj.stock = Number(obj.stock);

        return obj;
      });
  }

  /* =========================
     CARGA CSV/TSV
  ========================= */
  $("#loadClients")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const arr = parseCSV(reader.result);
      MOCK.customers = arr
        .map(c => ({ id: Number(c.id), name: String(c.name ?? "").trim() }))
        .filter(c => Number.isFinite(c.id) && c.id > 0 && c.name.length > 0);

      alert(`✅ Clientes cargados: ${MOCK.customers.length}`);
    };
    reader.readAsText(file, "utf-8");
  });

  $("#loadProducts")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const arr = parseCSV(reader.result);
      MOCK.products = arr
        .map(p => ({
          id: Number(p.id),
          code: String(p.code ?? "").trim(),
          name: String(p.name ?? "").trim(),
          prices: p.prices || { menudeo: 0, mayoreo: 0, empaque: 0 },
          stock: Number(p.stock || 0)
        }))
        .filter(p => Number.isFinite(p.id) && p.id > 0 && p.code && p.name);

      alert(`✅ Productos cargados: ${MOCK.products.length}`);
      renderProducts($("#productSearch")?.value || "");
    };
    reader.readAsText(file, "utf-8");
  });

  /* =========================
     STORAGE VENTAS (demo_sales)
  ========================= */
  function loadSales() {
    return JSON.parse(localStorage.getItem("demo_sales") || "[]");
  }
  function saveSales(sales) {
    localStorage.setItem("demo_sales", JSON.stringify(sales));
  }

  // Genera folio tipo 1-601256
  function nextFolioNumber() {
    const sales = loadSales();
    const max = sales.reduce((m, s) => Math.max(m, s.folioNumber || 601000), 601000);
    return max + 1;
  }

  /* =========================
     VISTAS
  ========================= */
  const views = { home: $("#view-home"), sale: $("#view-sale"), accounts: $("#view-accounts") };

  function setTop(title, subtitle) {
    $("#topTitle") && ($("#topTitle").textContent = title);
    $("#topSubtitle") && ($("#topSubtitle").textContent = subtitle);
  }

  function showView(name) {
    Object.entries(views).forEach(([k, el]) => el && el.classList.toggle("active", k === name));
    if (name === "home") setTop("Inicio", "Selecciona una opción");
    if (name === "sale") setTop("Generar venta", "Sigue los pasos");
    if (name === "accounts") setTop("Cuentas", "Pendientes o pagadas");
  }

  $("#go-sale")?.addEventListener("click", () => { resetSaleFlow(); showView("sale"); showStep(1); });
  $("#go-accounts")?.addEventListener("click", () => { resetAccounts(); showView("accounts"); });
  $("#back-home-1")?.addEventListener("click", () => showView("home"));
  $("#back-home-2")?.addEventListener("click", () => showView("home"));

  /* =========================================================
     GENERAR VENTA (SIN ABONOS)
  ========================================================= */
  const state = { customer: null, cart: [] };
  let currentInvoice = null; // { folioNumber, invoiceNo }

  function showStep(step) {
    $$(".step").forEach(s => s.classList.toggle("active", Number(s.dataset.step) === step));
    $$(".sale-step").forEach(p => p.hidden = Number(p.dataset.step) !== step);
  }

  function cartTotal() {
    return state.cart.reduce((a, i) => a + (i.price || 0) * i.qty, 0);
  }

  function updateStep3Summary() {
    const total = cartTotal();
    $("#payCustomer") && ($("#payCustomer").textContent = state.customer ? state.customer.name : "—");
    $("#payFolio") && ($("#payFolio").textContent = currentInvoice ? currentInvoice.invoiceNo : "—");
    $("#payTotal") && ($("#payTotal").textContent = fmt(total));
    $("#payPaid") && ($("#payPaid").textContent = fmt(0));
    $("#payPending") && ($("#payPending").textContent = fmt(total));
  }

  function resetSaleFlow() {
    state.customer = null;
    state.cart = [];
    currentInvoice = null;

    $("#customerSearch") && ($("#customerSearch").value = "");
    $("#customerResults") && ($("#customerResults").innerHTML = "");
    $("#customerSelected") && ($("#customerSelected").hidden = true);

    $("#productSearch") && ($("#productSearch").value = "");
    $("#productResults") && ($("#productResults").innerHTML = "");

    $("#cartCustomer") && ($("#cartCustomer").textContent = "");
    $("#cartList") && ($("#cartList").innerHTML = "");
    $("#cartTotal") && ($("#cartTotal").textContent = fmt(0));
    $("#cartHint") && ($("#cartHint").textContent = "");
    $("#saleToast") && ($("#saleToast").textContent = "");

    updateStep3Summary();
  }

  $("#to-step-2")?.addEventListener("click", () => showStep(2));
  $("#back-step-1")?.addEventListener("click", () => showStep(1));
  $("#back-step-2")?.addEventListener("click", () => showStep(2));

  $("#to-step-3")?.addEventListener("click", () => {
    if (!state.customer) {
      $("#cartHint") && ($("#cartHint").textContent = "Selecciona un cliente.");
      showStep(1);
      return;
    }
    if (state.cart.length === 0) {
      $("#cartHint") && ($("#cartHint").textContent = "Agrega al menos un producto.");
      return;
    }
    $("#cartHint") && ($("#cartHint").textContent = "");

    if (!currentInvoice) {
      const folioNumber = nextFolioNumber();
      currentInvoice = { folioNumber, invoiceNo: `1-${folioNumber}` };
    }

    updateStep3Summary();
    showStep(3);
  });

  /* --- Buscar cliente (Paso 1) --- */
  let t1;
  $("#customerSearch")?.addEventListener("input", () => {
    clearTimeout(t1);
    t1 = setTimeout(() => {
      const q = ($("#customerSearch")?.value || "").trim().toLowerCase();
      const wrap = $("#customerResults");
      if (!wrap) return;
      if (!q) { wrap.innerHTML = ""; return; }

      const list = MOCK.customers.filter(c =>
        String(c.id).includes(q) || c.name.toLowerCase().includes(q)
      );

      wrap.innerHTML = "";
      list.forEach(c => {
        const div = document.createElement("div");
        div.className = "item";
        div.innerHTML = `
          <div class="top">
            <div><strong>${c.name}</strong><div class="sub">ID: ${c.id}</div></div>
            <span class="badge ok">Seleccionar</span>
          </div>
        `;
        div.addEventListener("click", () => {
          state.customer = c;
          currentInvoice = null; // cambia factura al cambiar cliente

          $("#selectedCustomerName").textContent = c.name;
          $("#selectedCustomerId").textContent = c.id;

          const bal = loadSales()
            .filter(s => s.customerId === c.id)
            .reduce((sum, s) => sum + (s.pending || 0), 0);

          $("#selectedCustomerBalance").textContent = fmt(bal);
          $("#customerSelected").hidden = false;

          $("#cartCustomer") && ($("#cartCustomer").textContent = `Cliente: ${c.name}`);
          wrap.innerHTML = "";
          updateStep3Summary();
          renderCart();
        });
        wrap.appendChild(div);
      });
    }, 150);
  });

  $("#clearCustomer")?.addEventListener("click", () => {
    state.customer = null;
    currentInvoice = null;
    $("#customerSelected").hidden = true;
    $("#cartCustomer") && ($("#cartCustomer").textContent = "");
    updateStep3Summary();
    renderCart();
  });

  /* --- Buscar productos (Paso 2) --- */
  let t2;
  $("#productSearch")?.addEventListener("input", () => {
    clearTimeout(t2);
    t2 = setTimeout(() => renderProducts($("#productSearch")?.value || ""), 150);
  });

  function renderProducts(query = "") {
    const wrap = $("#productResults");
    if (!wrap) return;

    const q = (query || "").trim().toLowerCase();
    const list = !q ? MOCK.products : MOCK.products.filter(p =>
      String(p.code).toLowerCase().includes(q) || String(p.name).toLowerCase().includes(q)
    );

    wrap.innerHTML = "";
    list.forEach(p => {
      if (!p.prices) p.prices = { menudeo: 0, mayoreo: 0, empaque: 0 };
      const b = stockBadge(p.stock || 0);

      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div class="top">
          <div>
            <strong>${p.name}</strong>
            <div class="sub">${p.code} · Men: ${fmt(p.prices.menudeo)} · May: ${fmt(p.prices.mayoreo)} · Emp: ${fmt(p.prices.empaque)}</div>
          </div>
          <span class="badge ${b.cls}">${b.text}</span>
        </div>
        <div class="actions">
          <button class="btn primary" ${p.stock <= 0 ? "disabled" : ""} type="button">+ Agregar</button>
        </div>
      `;
      div.querySelector("button").addEventListener("click", () => addToCart(p));
      wrap.appendChild(div);
    });
  }
  renderProducts("");

  function addToCart(p) {
    if ((p.stock || 0) <= 0) return;

    const found = state.cart.find(i => i.id === p.id);
    if (found) {
      if (found.qty + 1 > p.stock) return;
      found.qty++;
    } else {
      state.cart.push({
        ...p,
        qty: 1,
        priceType: "menudeo",
        price: Number(p.prices?.menudeo || 0)
      });
    }
    renderCart();
  }

  function renderCart() {
    const wrap = $("#cartList");
    if (!wrap) return;

    wrap.innerHTML = "";
    let total = 0;

    state.cart.forEach((it, idx) => {
      total += (it.price || 0) * it.qty;

      const row = document.createElement("div");
      row.className = "cart-row";
      row.innerHTML = `
        <div class="cart-left">
          <strong>${it.name}</strong>
          <div class="sub">${it.code}</div>
          <div class="cart-price-row">
            <select class="priceSelect input small">
              <option value="menudeo" ${it.priceType === "menudeo" ? "selected" : ""}>Menudeo</option>
              <option value="mayoreo" ${it.priceType === "mayoreo" ? "selected" : ""}>Mayoreo</option>
              <option value="empaque" ${it.priceType === "empaque" ? "selected" : ""}>Empaque</option>
            </select>
            <span class="muted small">${fmt(it.price)} (${it.priceType}) c/u</span>
          </div>
        </div>
        <div class="qty">
          <button class="btn" type="button">−</button>
          <strong>${it.qty}</strong>
          <button class="btn" type="button">+</button>
        </div>
      `;

      const [minusBtn, plusBtn] = row.querySelectorAll(".qty button");
      minusBtn.addEventListener("click", () => {
        it.qty--;
        if (it.qty <= 0) state.cart.splice(idx, 1);
        renderCart();
      });
      plusBtn.addEventListener("click", () => {
        if (it.qty + 1 <= it.stock) it.qty++;
        renderCart();
      });

      row.querySelector(".priceSelect").addEventListener("change", (e) => {
        it.priceType = e.target.value;
        it.price = Number((it.prices?.[it.priceType]) || 0);
        renderCart();
      });

      wrap.appendChild(row);
    });

    $("#cartTotal").textContent = fmt(total);
    updateStep3Summary();
  }

  $("#finishSale")?.addEventListener("click", () => {
    if (!state.customer) {
      $("#saleToast").textContent = "Falta seleccionar cliente.";
      showStep(1);
      return;
    }
    if (state.cart.length === 0) {
      $("#saleToast").textContent = "Falta agregar productos.";
      showStep(2);
      return;
    }

    if (!currentInvoice) {
      const folioNumber = nextFolioNumber();
      currentInvoice = { folioNumber, invoiceNo: `1-${folioNumber}` };
    }

    const total = cartTotal();

    // SIN abonos: cobrado = 0, pendiente = total
    const sale = {
      folioNumber: currentInvoice.folioNumber,
      folio: currentInvoice.invoiceNo,
      date: formatDate(new Date()),
      customerId: state.customer.id,
      customerName: state.customer.name,
      agent: session.name || "VENDEDOR",
      status: "Pendiente",
      firstCollect: "", // PRIMER COBRO
      total,
      paid: 0,
      pending: total,
      items: state.cart.map(i => ({
        id: i.id,
        code: i.code,
        name: i.name,
        qty: i.qty,
        price: i.price,
        priceType: i.priceType
      }))
    };

    const sales = loadSales();
    sales.push(sale);
    saveSales(sales);

    $("#saleToast").textContent = `✅ Venta generada. Nº Factura ${sale.folio} · Pendiente ${fmt(sale.pending)}`;

    resetSaleFlow();
    showStep(1);
  });

  /* =========================================================
     CUENTAS (TABLA, SIN ABONOS)
     - Buscar por folio o cliente
     - Resumen cliente
     - Tabla scrolleable
  ========================================================= */
  let currentFilter = "TODAS";
  let activeCustomer = null;

  function resetAccounts() {
    activeCustomer = null;
    $("#accCustomerSearch") && ($("#accCustomerSearch").value = "");
    $("#accCustomerResults") && ($("#accCustomerResults").innerHTML = "");
    $("#accDetail") && ($("#accDetail").hidden = true);

    currentFilter = "TODAS";
    $$(".filter").forEach(b => b.classList.toggle("active", b.dataset.filter === "TODAS"));
  }

  $$(".filter").forEach(btn => {
    btn.addEventListener("click", () => {
      currentFilter = btn.dataset.filter;
      $$(".filter").forEach(b => b.classList.toggle("active", b === btn));
      if (activeCustomer) renderAccountsTable(activeCustomer);
    });
  });

  let t3;
  $("#accCustomerSearch")?.addEventListener("input", () => {
    clearTimeout(t3);
    t3 = setTimeout(() => {
      const q = ($("#accCustomerSearch").value || "").trim().toLowerCase();
      const wrap = $("#accCustomerResults");
      if (!wrap) return;

      if (!q) { wrap.innerHTML = ""; return; }

      const sales = loadSales();

      // Buscar por folio tipo "1-601256" o por número "601256"
      const byInvoice = sales.filter(s =>
        String(s.folio).toLowerCase().includes(q) ||
        String(s.folioNumber || "").includes(q)
      );

      if (byInvoice.length) {
        renderInvoiceSuggestions(byInvoice);
        return;
      }

      // Buscar por cliente (ID/nombre)
      const customers = MOCK.customers.filter(c =>
        String(c.id).includes(q) || c.name.toLowerCase().includes(q)
      );

      renderCustomerSuggestions(customers);
    }, 150);
  });

  function renderInvoiceSuggestions(list) {
    const wrap = $("#accCustomerResults");
    wrap.innerHTML = "";
    list.slice(0, 20).forEach(s => {
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div class="top">
          <div>
            <strong>${s.folio}</strong>
            <div class="sub">${s.customerName}</div>
          </div>
          <span class="badge low">${s.status}</span>
        </div>
        <div class="sub">Pendiente: <strong>${fmt(s.pending)}</strong></div>
      `;
      div.addEventListener("click", () => {
        activeCustomer = { id: s.customerId, name: s.customerName };
        $("#accDetail").hidden = false;
        renderAccountsTable(activeCustomer);
        wrap.innerHTML = "";
      });
      wrap.appendChild(div);
    });
  }

  function renderCustomerSuggestions(customers) {
    const wrap = $("#accCustomerResults");
    wrap.innerHTML = "";
    customers.slice(0, 20).forEach(c => {
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div class="top">
          <div>
            <strong>${c.name}</strong>
            <div class="sub">ID: ${c.id}</div>
          </div>
          <span class="badge ok">Ver</span>
        </div>
      `;
      div.addEventListener("click", () => {
        activeCustomer = c;
        $("#accDetail").hidden = false;
        renderAccountsTable(c);
        wrap.innerHTML = "";
      });
      wrap.appendChild(div);
    });
  }

  function renderAccountsTable(customer) {
    const all = loadSales().filter(s => s.customerId === customer.id);

    let list = all;
    if (currentFilter === "PENDIENTES") list = all.filter(s => (s.pending || 0) > 0);
    if (currentFilter === "PAGADAS") list = all.filter(s => (s.pending || 0) <= 0);

    const balance = all.reduce((sum, s) => sum + (s.pending || 0), 0);
    const pendientesCount = all.filter(s => (s.pending || 0) > 0).length;

    $("#accTitle").textContent = `${customer.name} (#${customer.id})`;
    $("#accSubtitle").textContent = `Facturas: ${all.length} · Pendientes: ${pendientesCount}`;
    $("#accBalance").textContent = fmt(balance);

    const tbody = $("#accSales");
    tbody.innerHTML = "";

    list
      .slice()
      .sort((a, b) => String(b.folio).localeCompare(String(a.folio)))
      .forEach(s => {
        const statusClass = (s.pending || 0) > 0 ? "pendiente" : "pagado";

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${s.folio}</td>
          <td>${s.date}</td>
          <td>${String(s.customerId).padStart(6, "0")} - ${s.customerName}</td>
          <td>${s.agent || "VENDEDOR"}</td>
          <td class="status ${statusClass}">${(s.pending || 0) > 0 ? "Pendiente" : "Pagado"}</td>
          <td>${s.firstCollect || ""}</td>
          <td class="right">${fmt(s.total)}</td>
          <td class="right">${fmt(s.paid || 0)}</td>
          <td class="right">${fmt(s.pending || 0)}</td>
        `;
        tbody.appendChild(tr);
      });

    $("#accDetail").hidden = false;
  }

  /* Arranque */
  showView("home");
})();