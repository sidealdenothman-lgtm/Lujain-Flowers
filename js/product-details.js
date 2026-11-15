import { db } from "./firebase.js";

import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// عناصر الصفحة
const mainImage = document.getElementById("main-product-image");
const thumbnails = document.getElementById("product-thumbnails");
let currentImageIndex = 0;
const productName = document.getElementById("detail-product-name");
const productDescription = document.getElementById("detail-product-description");
const whatsappButton = document.getElementById("order-product-whatsapp");
const shareButton = document.getElementById("share-product-whatsapp");
const loadingMessage = document.getElementById("product-loading");

// قراءة بيانات الرابط
const params = new URLSearchParams(window.location.search);
const productId = params.get("id");
const branchId = params.get("branch");

// تحميل تفاصيل المنتج والفرع
async function loadProductDetails() {
    try {
        if (!productId || !["branch1", "branch2"].includes(branchId)) {
            throw new Error("رابط المنتج أو الفرع غير صحيح");
        }

        // جلب المنتج
        const productRef = doc(db, "products", productId);
        const productSnapshot = await getDoc(productRef);

        if (!productSnapshot.exists()) {
            throw new Error("المنتج غير موجود");
        }

        const product = productSnapshot.data();

        if (product.active === false) {
            throw new Error("هذا المنتج غير متاح حالياً");
        }

        // جلب بيانات الفرع
        const branchRef = doc(db, "branches", branchId);
        const branchSnapshot = await getDoc(branchRef);

        if (!branchSnapshot.exists()) {
            throw new Error("بيانات الفرع غير موجودة");
        }

        const branch = branchSnapshot.data();
        const sharedSnapshot = await getDoc(doc(db, "settings", "shared"));
        let shared = sharedSnapshot.exists() ? sharedSnapshot.data() : {};
        if (!sharedSnapshot.exists()) {
            const legacyShared = await getDoc(doc(db, "branches", "branch1"));
            if (legacyShared.exists()) shared = legacyShared.data();
        }

        // عرض بيانات المنتج
        productName.textContent = product.name || "";
        productDescription.textContent = product.description || "";

        // عرض الصور
        const images = Array.isArray(product.images)
            ? product.images
                .map(image => typeof image === "string" ? image : image?.url)
                .filter(Boolean)
            : [];

        thumbnails.innerHTML = "";

        if (images.length > 0) {
            mainImage.src = images[0];
            mainImage.alt = product.name || "صورة المنتج";

            images.forEach((imageUrl, index) => {
                const thumbnail = document.createElement("img");

                thumbnail.src = imageUrl;
                thumbnail.alt = `صورة ${index + 1}`;
                thumbnail.loading = "lazy";

                thumbnail.addEventListener("click", function () {
    mainImage.src = imageUrl;
    currentImageIndex = index;
});

                thumbnails.appendChild(thumbnail);
            });
        } else {
            mainImage.style.display = "none";
        }

        // إعداد طلب واتساب للفرع المحدد
        let phone = String(shared.whatsapp || "").replace(/\D/g, "");

if (phone.startsWith("0")) {
    phone = "963" + phone.substring(1);
}

if (phone) {
    const message = `مرحباً، أرغب بالاستفسار عن المنتج: ${product.name}`;

    whatsappButton.href =
        `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
} else {
    whatsappButton.style.display = "none";
}
// مشاركة المنتج عبر واتساب
if (shareButton) {
    shareButton.addEventListener("click", function () {
        const productUrl = window.location.href;

        const shareMessage =
            `شاهد هذا المنتج من لجين فلاورز 🌹\n` +
            `${product.name}\n` +
            `${productUrl}`;

        const whatsappShareUrl =
            `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;

        window.open(whatsappShareUrl, "_blank");
    });
}
        document.title = `${product.name} | لجين فلاورز`;
        loadingMessage.style.display = "none";

    } catch (error) {
        console.error("خطأ في تحميل تفاصيل المنتج:", error);
        loadingMessage.textContent =
            "تعذر تحميل تفاصيل المنتج. يرجى التأكد من الرابط والمحاولة لاحقاً.";
    }
}

loadProductDetails();
// زر العودة إلى كتالوج الفرع نفسه
const backButton = document.getElementById("back-to-catalog");

if (backButton) {
    backButton.href = `catalog.html?branch=${encodeURIComponent(branchId)}`;
}

// تكبير الصورة الرئيسية
const lightbox = document.getElementById("image-lightbox");
const lightboxImage = document.getElementById("lightbox-image");
const closeLightbox = document.getElementById("close-lightbox");

if (mainImage) {
    mainImage.style.cursor = "zoom-in";

    mainImage.addEventListener("click", function () {
        if (!mainImage.src) return;

        lightboxImage.src = mainImage.src;
        lightbox.style.display = "flex";
    });
}

// إغلاق الصورة المكبرة
if (closeLightbox) {
    closeLightbox.addEventListener("click", function () {
        lightbox.style.display = "none";
    });
}

if (lightbox) {
    lightbox.addEventListener("click", function (event) {
        if (event.target === lightbox) {
            lightbox.style.display = "none";
        }
    });
}
// التنقل بين صور المنتج بالسحب على الهاتف
let touchStartX = 0;
let touchEndX = 0;

mainImage.addEventListener("touchstart", function (event) {
    touchStartX = event.changedTouches[0].screenX;
}, { passive: true });

mainImage.addEventListener("touchend", function (event) {
    touchEndX = event.changedTouches[0].screenX;

    const difference = touchStartX - touchEndX;

    if (Math.abs(difference) < 50) return;

    const images = thumbnails.querySelectorAll("img");

    if (images.length <= 1) return;

    if (difference > 0) {
        // السحب لليسار: الصورة التالية
        currentImageIndex = (currentImageIndex + 1) % images.length;
    } else {
        // السحب لليمين: الصورة السابقة
        currentImageIndex =
            (currentImageIndex - 1 + images.length) % images.length;
    }

    mainImage.src = images[currentImageIndex].src;

}, { passive: true });