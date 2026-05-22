document.addEventListener("DOMContentLoaded", () => {
    const toggle = document.querySelector("[data-nav-toggle]");
    const menu = document.querySelector("[data-nav-menu]");

    if (toggle && menu) {
        toggle.addEventListener("click", () => {
            menu.classList.toggle("open");
        });
    }

    document.querySelectorAll("[data-confirm-delete]").forEach((form) => {
        form.addEventListener("submit", (event) => {
            if (!confirm("ยืนยันการลบรายการนี้?")) {
                event.preventDefault();
            }
        });
    });

    document.querySelectorAll("[data-confirm-order]").forEach((form) => {
        form.addEventListener("submit", (event) => {
            if (!confirm("ยืนยันการส่งออเดอร์และแนบสลิปนี้?")) {
                event.preventDefault();
            }
        });
    });

    const money = new Intl.NumberFormat("th-TH", {
        style: "currency",
        currency: "THB",
        maximumFractionDigits: 0,
    });

    document.querySelectorAll("[data-static-form]").forEach((form) => {
        form.addEventListener("submit", (event) => {
            if (form.hasAttribute("data-firebase-form")) {
                return;
            }
            if (event.defaultPrevented) {
                return;
            }
            event.preventDefault();
            alert("หน้านี้เป็น HTML static สำหรับรันบน Vercel จึงยังไม่บันทึกข้อมูลจริง หากต้องการระบบสมาชิก/ออเดอร์จริงต้องต่อ backend หรือ API เพิ่ม");
        });
    });

    const initShopFilter = () => {
        const shopFilter = document.querySelector("[data-shop-filter]");
        if (!shopFilter || shopFilter.dataset.filterReady === "true") {
            return;
        }
        shopFilter.dataset.filterReady = "true";
        const cards = Array.from(document.querySelectorAll("[data-product-card]"));
        const empty = document.querySelector("[data-shop-empty]");
        const applyFilter = () => {
            const form = new FormData(shopFilter);
            const brand = String(form.get("brand") || "").trim().toLowerCase();
            const model = String(form.get("model") || "").trim().toLowerCase();
            const ecu = String(form.get("ecu_type") || "").trim().toLowerCase();
            let visible = 0;

            cards.forEach((card) => {
                const text = `${card.dataset.brand} ${card.dataset.model} ${card.dataset.ecu}`.toLowerCase();
                const match = (!brand || text.includes(brand)) && (!model || text.includes(model)) && (!ecu || text.includes(ecu));
                card.hidden = !match;
                if (match) visible += 1;
            });

            if (empty) {
                empty.hidden = visible !== 0;
            }
        };

        shopFilter.addEventListener("submit", (event) => {
            event.preventDefault();
            applyFilter();
        });
        shopFilter.addEventListener("reset", () => {
            setTimeout(applyFilter, 0);
        });
        shopFilter.addEventListener("input", applyFilter);
        applyFilter();
    };

    initShopFilter();
    document.addEventListener("tr:products-rendered", () => {
        const shopFilter = document.querySelector("[data-shop-filter]");
        if (shopFilter) {
            delete shopFilter.dataset.filterReady;
        }
        initShopFilter();
    });

    const checkout = document.querySelector("[data-static-checkout]");
    if (checkout && window.TR_SYNTAX_DATA) {
        const params = new URLSearchParams(window.location.search);
        const productId = Number(params.get("product_id"));
        const packageId = Number(params.get("package_id"));
        const item = productId
            ? window.TR_SYNTAX_DATA.products.find((product) => product.id === productId)
            : window.TR_SYNTAX_DATA.packages.find((pack) => pack.id === packageId);

        if (item) {
            checkout.querySelector("[data-checkout-title]").textContent = item.title;
            checkout.querySelector("[data-checkout-description]").textContent = item.description;
            checkout.querySelector("[data-checkout-price]").textContent = money.format(item.price);
            checkout.querySelector("[data-product-id]").value = productId || "";
            checkout.querySelector("[data-package-id]").value = packageId || "";
        }
    }
});
