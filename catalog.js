import { db } from "./firebase.js";

import {
    collection,
    getDocs,
    query,
    orderBy,
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
// بيانات الأقسام والمنتجات
let categories = {};
let products = [];
let currentBranchId = "";
// تحميل بيانات الفرع المحدد من الرابط
async function loadBranchSettings() {
    try {
        const params = new URLSearchParams(window.location.search);
        const branchId = params.get("branch");
currentBranchId = branchId;
        if (!["branch1", "branch2"].includes(branchId)) {
            throw new Error("رابط الكتالوج لا يحتوي على فرع صحيح");
        }

        const branchRef = doc(db, "branches", branchId);
        const branchSnapshot = await getDoc(branchRef);

        if (!branchSnapshot.exists()) {
            throw new Error("بيانات الفرع غير موجودة");
        }

        const branch = branchSnapshot.data();
        const sharedSnapshot = await getDoc(doc(db, "settings", "shared"));
        // توافق رجعي: إن لم يوجد المستند المشترك بعد، نستخدم بيانات التواصل القديمة من الفرع الأول.
        let shared = sharedSnapshot.exists() ? sharedSnapshot.data() : {};
        if (!sharedSnapshot.exists()) {
            const legacyShared = await getDoc(doc(db, "branches", "branch1"));
            if (legacyShared.exists()) shared = legacyShared.data();
        }

        const name = document.getElementById("branch-name");
        const address = document.getElementById("branch-address");
        const whatsapp = document.getElementById("branch-whatsapp");
        const map = document.getElementById("branch-map");
        const qr = document.getElementById("branch-qr");

        if (name) name.textContent = branch.name || (branchId === "branch1" ? "الفرع الأول" : "الفرع الثاني");
        if (address) address.textContent = branch.address || "";
        if (whatsapp) {
            let phone = String(shared.whatsapp || "").replace(/\D/g, "");
            if (phone.startsWith("0")) phone = "963" + phone.substring(1);
            whatsapp.href = phone ? `https://wa.me/${phone}` : "#";
        }
        if (map) {
            map.href = shared.mapUrl || "#";
            map.style.display = shared.mapUrl ? "" : "none";
        }

        if (qr) {
            if (branch.shamCashQrUrl) {
                qr.src = branch.shamCashQrUrl;
                qr.style.display = "";
            } else {
                qr.style.display = "none";
            }
        }

        console.log("تم تحميل بيانات الفرع:", branchId, branch);

    } catch (error) {
        console.error("خطأ في تحميل بيانات الفرع:", error);

        const section = document.getElementById("branch-section");

        if (section) {
            section.innerHTML =
                "<p>تعذر تحميل بيانات الفرع. يرجى التأكد من رابط الكتالوج.</p>";
        }
    }
}
// عناصر صفحة الكتالوج
const productsGrid = document.getElementById("products-grid");
const productsTitle = document.getElementById("products-title");

// قراءة الأقسام من Firestore
// قراءة الأقسام من Firestore
async function loadCategories() {
    const categoriesQuery = query(
        collection(db, "categories-v2"),
        orderBy("order", "asc")
    );

    const snapshot = await getDocs(categoriesQuery);

    categories = {};

    snapshot.forEach((categoryDoc) => {
        const data = categoryDoc.data();

        if (data.active === true) {
            categories[categoryDoc.id] = data.name;
        }
    });

    console.log("تم تحميل الأقسام من categories-v2:", categories);

    renderCategoryCards();
}


// إنشاء بطاقات الأقسام من Firestore
function renderCategoryCards() {
    const categoriesContainer = document.querySelector(".categories-grid");

    if (!categoriesContainer) {
        console.error("لم يتم العثور على حاوية الأقسام");
        return;
    }

    categoriesContainer.innerHTML = "";

    Object.entries(categories).forEach(([id, name]) => {
        const card = document.createElement("div");

        card.className = "category-card";
        card.dataset.category = id;

        const title = document.createElement("h3");
        title.textContent = name;

        card.appendChild(title);

        card.addEventListener("click", function () {
            displayProducts(id);
        });

        categoriesContainer.appendChild(card);
    });
}

// قراءة المنتجات من Firestore
async function loadProducts() {
    const productsQuery = query(
        collection(db, "products"),
        orderBy("order", "asc")
    );

    const snapshot = await getDocs(productsQuery);

    products = [];

    snapshot.forEach((doc) => {
        const data = doc.data();

        if (data.active !== false) {
            products.push({
                id: doc.id,
                name: data.name || "",
                description: data.description || "",
                category: data.categoryId || "",
                images: Array.isArray(data.images) ? data.images : []
            });
        }
    });

    console.log("تم تحميل المنتجات:", products);
}

// عرض المنتجات
function displayProducts(category = "all") {
    if (!productsGrid) return;

    const filteredProducts = category === "all"
        ? products
        : products.filter(product => product.category === category);

    productsGrid.innerHTML = "";

    if (productsTitle) {
        productsTitle.textContent = category === "all"
            ? "جميع المنتجات"
            : categories[category] || "المنتجات";
    }

    if (filteredProducts.length === 0) {
        productsGrid.innerHTML =
            "<p>لا توجد منتجات في هذا القسم حالياً.</p>";
        return;
    }

    filteredProducts.forEach(product => {
        const card = document.createElement("div");
card.className = "product-card";

card.style.cursor = "pointer";

card.addEventListener("click", function () {
    const url = `product-details.html?id=${encodeURIComponent(product.id)}&branch=${encodeURIComponent(currentBranchId)}`;
    window.location.href = url;
});

        if (product.images.length > 0) {
    const image = document.createElement("img");

    const firstImage = product.images[0];

    image.src = typeof firstImage === "string"
        ? firstImage
        : firstImage.url;

    image.alt = product.name;
    image.loading = "lazy";

    image.onerror = function () {
        console.error("تعذر تحميل صورة المنتج:", image.src);
        image.alt = "تعذر تحميل الصورة";
    };

    card.appendChild(image);
}

        const title = document.createElement("h3");
        title.textContent = product.name;

        const description = document.createElement("p");
        description.textContent = product.description;

        card.append(title, description);
        productsGrid.appendChild(card);
    });
}

// الضغط على الأقسام
document.querySelectorAll(".category-card").forEach(card => {
    card.addEventListener("click", function () {
        displayProducts(this.dataset.category);
    });
});

// عرض جميع المنتجات
const allProductsButton =
    document.querySelector(".all-products-button");

if (allProductsButton) {
    allProductsButton.addEventListener("click", function () {
        displayProducts("all");
    });
}

// تشغيل الكتالوج
async function initializeCatalog() {
    try {
        await loadBranchSettings();
        await loadCategories();
        await loadProducts();
        displayProducts();

    } catch (error) {
        console.error("خطأ في تحميل بيانات الكتالوج:", error);

        if (productsGrid) {
            productsGrid.innerHTML =
                "<p>حدث خطأ أثناء تحميل المنتجات. يرجى المحاولة لاحقاً.</p>";
        }
    }
}

initializeCatalog();