import { auth, db, app } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
    collection,
    addDoc,
    serverTimestamp,
    getDocs,
    getDocsFromServer,
    getDoc,
    getDocFromServer,
    query,
    orderBy,
    doc,
    deleteDoc,
    setDoc,
  updateDoc,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

console.log("Firebase Project ID:", app.options.projectId);

// =====================================
// عناصر لوحة التحكم
// =====================================

const navigationButtons = document.querySelectorAll(".sidebar nav button");
const adminSections = document.querySelectorAll(".admin-section");

const showProductButton = document.getElementById("show-product-form");
const cancelProductButton = document.getElementById("cancel-product-form");

const productForm = document.getElementById("product-form");

const productImageInput = document.getElementById("product-image");
const imagesPreview = document.getElementById("product-images-preview");

let selectedProductFiles = [];
let previewObjectURLs = [];

let editingProductId = null;

let existingProductImages = [];
let removedProductImages = [];

// =====================================
// التنقل بين الأقسام
// =====================================

navigationButtons.forEach(button => {
    button.addEventListener("click", function () {

        navigationButtons.forEach(item => {
            item.classList.remove("active");
        });

        this.classList.add("active");

        adminSections.forEach(section => {
            section.classList.remove("active");
        });

        const sectionId = this.dataset.section;
        const selectedSection = document.getElementById(sectionId);

        if (selectedSection) {
            selectedSection.classList.add("active");
        }
    });
});

// =====================================
// تنظيف معاينة الصور
// =====================================

function clearPreviewURLs() {
    previewObjectURLs.forEach(url => URL.revokeObjectURL(url));
    previewObjectURLs = [];
}

// =====================================
// إعادة ضبط نموذج المنتج
// =====================================

function resetProductForm() {

    productForm.reset();

    editingProductId = null;
    existingProductImages = [];
    removedProductImages = [];
    selectedProductFiles = [];

    clearPreviewURLs();

    if (imagesPreview) {
        imagesPreview.innerHTML = "";
    }

    const submitButton = productForm.querySelector('button[type="submit"]');

    if (submitButton) {
        submitButton.textContent = "حفظ المنتج";
    }

    productForm.hidden = true;
}

// =====================================
// إظهار نموذج الإضافة
// =====================================

if (showProductButton && productForm) {

    showProductButton.addEventListener("click", function () {

        resetProductForm();

        const heading = productForm.querySelector("h3");

        if (heading) {
            heading.textContent = "إضافة منتج جديد";
        }

        productForm.hidden = false;

        productForm.scrollIntoView({
            behavior: "smooth"
        });
    });
}

// =====================================
// إلغاء النموذج
// =====================================

if (cancelProductButton && productForm) {

    cancelProductButton.addEventListener("click", function () {
        resetProductForm();
    });
}

// =====================================
// معاينة الصور القديمة والجديدة
// =====================================

function renderProductImages() {

    clearPreviewURLs();

    if (!imagesPreview) return;

    imagesPreview.innerHTML = "";

    // الصور القديمة

    existingProductImages.forEach((imageData, index) => {

        const imageURL = typeof imageData === "string"
            ? imageData
            : imageData.url;

        if (!imageURL) return;

        const wrapper = document.createElement("div");
        wrapper.className = "admin-image-preview";

        const image = document.createElement("img");
        image.src = imageURL;
        image.alt = "صورة محفوظة";
        image.loading = "lazy";

        const label = document.createElement("small");
        label.textContent = "صورة محفوظة";

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.textContent = "إزالة الصورة";

        removeButton.addEventListener("click", function () {

            const confirmed = confirm("هل تريد إزالة هذه الصورة من المنتج؟");

            if (!confirmed) return;

            const removedImage = existingProductImages.splice(index, 1)[0];

            if (
                removedImage &&
                typeof removedImage === "object" &&
                removedImage.path
            ) {
                removedProductImages.push(removedImage);
            }

            renderProductImages();
        });

        wrapper.append(image, label, removeButton);
        imagesPreview.appendChild(wrapper);
    });

    // الصور الجديدة

    selectedProductFiles.forEach((file, index) => {

        const wrapper = document.createElement("div");
        wrapper.className = "admin-image-preview";

        const image = document.createElement("img");

        const imageURL = URL.createObjectURL(file);
        previewObjectURLs.push(imageURL);

        image.src = imageURL;
        image.alt = "صورة جديدة";

        const label = document.createElement("small");
        label.textContent = "صورة جديدة";

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.textContent = "إزالة الصورة";

        removeButton.addEventListener("click", function () {

            selectedProductFiles.splice(index, 1);

            const dataTransfer = new DataTransfer();

            selectedProductFiles.forEach(file => {
                dataTransfer.items.add(file);
            });

            productImageInput.files = dataTransfer.files;

            renderProductImages();
        });

        wrapper.append(image, label, removeButton);
        imagesPreview.appendChild(wrapper);
    });
}
// =====================================
// اختيار الصور الجديدة
// =====================================

if (productImageInput) {

    productImageInput.addEventListener("change", function () {

        const files = Array.from(this.files);

        if (files.some(file => !file.type.startsWith("image/"))) {
            alert("يرجى اختيار ملفات صور فقط.");
            this.value = "";
            return;
        }

        const maxSize = 5 * 1024 * 1024;

        if (files.some(file => file.size > maxSize)) {
            alert("حجم كل صورة يجب ألا يتجاوز 5 ميغابايت.");
            this.value = "";
            return;
        }

        selectedProductFiles = files;

        renderProductImages();
    });
}

// =====================================
// رفع صورة إلى Supabase
// =====================================

async function uploadProductImage(file) {

    const user = auth.currentUser;

    if (!user) {
        throw new Error("يجب تسجيل الدخول أولاً.");
    }

    const token = await user.getIdToken();

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(
        "https://wwqzhckptibzltizaqnf.supabase.co/functions/v1/upload-product-image",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`
            },
            body: formData
        }
    );

    const result = await response.json();

    if (!response.ok || !result.success || !result.url) {
        throw new Error(result.error || "فشل رفع الصورة.");
    }

    return {
        url: result.url,
        path: result.path
    };
}

// =====================================
// حذف صور من Supabase
// =====================================

async function deleteProductImages(paths) {

    if (!paths || paths.length === 0) {
        return;
    }

    const user = auth.currentUser;

    if (!user) {
        throw new Error("يجب تسجيل الدخول أولاً.");
    }

    const token = await user.getIdToken();

    const formData = new FormData();

    formData.append("action", "delete");
    formData.append("paths", JSON.stringify(paths));

    const response = await fetch(
        "https://wwqzhckptibzltizaqnf.supabase.co/functions/v1/upload-product-image",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`
            },
            body: formData
        }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
        throw new Error(result.error || "فشل حذف الصور.");
    }

    return result;
}

// =====================================
// استخراج مسارات الصور
// =====================================

function getImagePaths(images) {

    if (!Array.isArray(images)) return [];

    return images
        .map(image => {
            return typeof image === "object" && image !== null
                ? image.path
                : null;
        })
        .filter(path => typeof path === "string" && path.length > 0);
}

// =====================================
// حذف المنتج نهائياً
// =====================================

async function deleteAdminProduct(productId, product) {

    const imagePaths = getImagePaths(product.images);

    await deleteDoc(doc(db, "products", productId));

    try {
        await deleteProductImages(imagePaths);
        return true;

    } catch (error) {
        console.error("Image cleanup error:", error);
        return false;
    }
}

// =====================================
// فتح منتج للتعديل
// =====================================

function editAdminProduct(productId, product) {

    editingProductId = productId;

    document.getElementById("product-name").value =
        product.name || "";

    document.getElementById("product-description").value =
        product.description || "";

    document.getElementById("product-category").value =
        product.categoryId || "";

    existingProductImages = Array.isArray(product.images)
        ? [...product.images]
        : [];

    removedProductImages = [];
    selectedProductFiles = [];

    productImageInput.value = "";

    const heading = productForm.querySelector("h3");

    if (heading) {
        heading.textContent = "تعديل بيانات المنتج";
    }

    const submitButton = productForm.querySelector('button[type="submit"]');

    if (submitButton) {
        submitButton.textContent = "حفظ التعديلات";
    }

    productForm.hidden = false;

    renderProductImages();

    productForm.scrollIntoView({
        behavior: "smooth"
    });
}
// =====================================
// حفظ منتج جديد أو تعديل منتج موجود
// =====================================

if (productForm) {

    productForm.addEventListener("submit", async function (event) {

        event.preventDefault();

        const name = document.getElementById("product-name").value.trim();

        const description =
            document.getElementById("product-description").value.trim();

        const categoryId =
            document.getElementById("product-category").value;

        if (!name || !description || !categoryId) {
            alert("يرجى تعبئة جميع بيانات المنتج.");
            return;
        }

        if (
            existingProductImages.length === 0 &&
            selectedProductFiles.length === 0
        ) {
            alert("يجب الاحتفاظ بصورة واحدة على الأقل أو إضافة صورة جديدة.");
            return;
        }

        const saveButton = productForm.querySelector('button[type="submit"]');

        const uploadedImages = [];

        try {

            saveButton.disabled = true;

            saveButton.textContent = editingProductId
                ? "جارٍ حفظ التعديلات..."
                : "جارٍ رفع الصور وحفظ المنتج...";

            // رفع الصور الجديدة

            for (const file of selectedProductFiles) {

                const imageData = await uploadProductImage(file);

                uploadedImages.push(imageData);
            }

            const finalImages = [
                ...existingProductImages,
                ...uploadedImages
            ];

            if (editingProductId) {

                // تعديل المنتج الموجود

                await updateDoc(
                    doc(db, "products", editingProductId),
                    {
                        name,
                        description,
                        categoryId,
                        images: finalImages,
                        updatedAt: serverTimestamp()
                    }
                );

                // حذف الصور المستبعدة بعد نجاح التحديث

                const removedPaths = getImagePaths(removedProductImages);

                if (removedPaths.length > 0) {

                    try {
                        await deleteProductImages(removedPaths);

                        alert("تم تعديل المنتج وحذف الصور المستبعدة بنجاح.");

                    } catch (imageError) {

                        console.error("Old image deletion error:", imageError);

                        alert("تم تعديل المنتج، لكن تعذر حذف بعض الصور القديمة من التخزين.");
                    }

                } else {
                    alert("تم تعديل المنتج بنجاح!");
                }

            } else {

                // إضافة منتج جديد

                await addDoc(collection(db, "products"), {
                    name,
                    description,
                    categoryId,
                    images: finalImages,
                    active: true,
                    order: Date.now(),
                    createdAt: serverTimestamp()
                });

                alert("تم حفظ المنتج بنجاح!");
            }

            resetProductForm();

            await loadAdminProducts();

        } catch (error) {

            console.error("Product save error:", error);

            // محاولة تنظيف الصور الجديدة إذا فشلت عملية الحفظ

            try {

                const newPaths = getImagePaths(uploadedImages);

                await deleteProductImages(newPaths);

            } catch (cleanupError) {

                console.error("Uploaded image cleanup error:", cleanupError);
            }

            alert("لم يتم حفظ التغييرات: " + error.message);

        } finally {

            saveButton.disabled = false;

            saveButton.textContent = editingProductId
                ? "حفظ التعديلات"
                : "حفظ المنتج";
        }
    });
}
// ==========================================
// تحميل المنتجات وعرضها في لوحة التحكم
// ==========================================

async function loadAdminProducts() {
    const productsList = document.getElementById("products-list");

    if (!productsList) return;

    productsList.innerHTML = "<p>جارٍ تحميل المنتجات...</p>";

    try {
        const productsQuery = query(
            collection(db, "products"),
            orderBy("order", "asc")
        );

        const snapshot = await getDocsFromServer(productsQuery);

        productsList.innerHTML = "";

        if (snapshot.empty) {
            productsList.innerHTML = "<p>لا توجد منتجات حالياً.</p>";
            return;
        }

        snapshot.forEach((productDoc) => {
            const product = productDoc.data();

            const card = document.createElement("div");
            card.className = "admin-product-card";

            const title = document.createElement("h3");
            title.textContent = product.name || "منتج بدون اسم";

            const description = document.createElement("p");
            description.textContent = product.description || "";

            const category = document.createElement("p");
            category.textContent = `القسم: ${product.categoryId || "غير محدد"}`;

            card.appendChild(title);
            card.appendChild(description);
            card.appendChild(category);

            // عرض صورة المنتج
            const images = Array.isArray(product.images)
                ? product.images
                : [];

            if (images.length > 0) {
                const firstImage = images[0];

                const imageUrl =
                    typeof firstImage === "string"
                        ? firstImage
                        : firstImage?.url;

                if (imageUrl) {
                    const image = document.createElement("img");
                    image.src = imageUrl;
                    image.alt = product.name || "صورة المنتج";
                    image.style.width = "120px";
                    image.style.height = "120px";
                    image.style.objectFit = "cover";
                    image.style.borderRadius = "8px";

                    card.appendChild(image);
                }
            }

            // زر تعديل المنتج
            const editButton = document.createElement("button");
            editButton.textContent = "تعديل";
            editButton.type = "button";

            editButton.addEventListener("click", () => {
    editAdminProduct(productDoc.id, product);
});

            // زر حذف المنتج
            const deleteButton = document.createElement("button");
            deleteButton.textContent = "حذف";
            deleteButton.type = "button";

            deleteButton.addEventListener("click", async () => {
                const confirmed = confirm(
                    `هل أنت متأكد من حذف المنتج "${product.name || ""}"؟`
                );

                if (!confirmed) return;

                try {
                   await deleteAdminProduct(productDoc.id, product);
                    alert("تم حذف المنتج بنجاح.");

                    await loadAdminProducts();
                } catch (error) {
                    console.error("خطأ أثناء حذف المنتج:", error);
                    alert("حدث خطأ أثناء حذف المنتج.");
                }
            });

            card.appendChild(editButton);
            card.appendChild(deleteButton);

            productsList.appendChild(card);
        });

    } catch (error) {
        console.error("خطأ أثناء تحميل المنتجات:", error);

        productsList.innerHTML =
            "<p>تعذر تحميل المنتجات. تحقق من الاتصال والصلاحيات.</p>";
    }
}
// ==========================================
// إدارة الأقسام - categories-v2
// ==========================================

const categoryForm = document.getElementById("category-form");
const categoryNameInput = document.getElementById("category-name");
const categoryIdInput = document.getElementById("category-id");
const categoryList = document.getElementById("categories-list");
const saveCategoryButton = document.getElementById("save-category");
const cancelCategoryEdit = document.getElementById("cancel-category-edit");

let editingCategoryId = null;


// إعادة نموذج القسم إلى وضع الإضافة
function resetCategoryForm() {
    editingCategoryId = null;

    if (categoryForm) {
        categoryForm.reset();
    }

    if (saveCategoryButton) {
        saveCategoryButton.textContent = "إضافة القسم";
    }

    if (cancelCategoryEdit) {
        cancelCategoryEdit.style.display = "none";
    }
}


// تحميل الأقسام من المجموعة الجديدة
async function loadAdminCategories() {
    if (!categoryList) return;

    categoryList.innerHTML = "<p>جارٍ تحميل الأقسام...</p>";

    try {
        const snapshot = await getDocsFromServer(
            collection(db, "categories-v2")
        );

        categoryList.innerHTML = "";

        if (snapshot.empty) {
            categoryList.innerHTML = "<p>لا توجد أقسام حالياً.</p>";
            return;
        }

        const categories = snapshot.docs
            .map((categoryDoc) => ({
                id: categoryDoc.id,
                ...categoryDoc.data()
            }))
            .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

        categories.forEach((category) => {
            const card = document.createElement("div");
            card.className = "admin-category-card";

            const title = document.createElement("h3");
            title.textContent = category.name || category.id;

            const idText = document.createElement("p");
            idText.textContent = `المعرّف: ${category.id}`;

            card.appendChild(title);
            card.appendChild(idText);

            // زر تعديل القسم
            const editButton = document.createElement("button");
            editButton.type = "button";
            editButton.textContent = "تعديل";

            editButton.addEventListener("click", () => {
                editingCategoryId = category.id;

                if (categoryNameInput) {
                    categoryNameInput.value = category.name || "";
                }

                if (categoryIdInput) {
                    categoryIdInput.value = category.id;
                }

                if (saveCategoryButton) {
                    saveCategoryButton.textContent = "حفظ التعديلات";
                }

                if (cancelCategoryEdit) {
                    cancelCategoryEdit.style.display = "inline-block";
                }
            });

            // زر حذف القسم
            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.textContent = "حذف";

            deleteButton.addEventListener("click", async () => {
                const confirmed = confirm(
                    `هل أنت متأكد من حذف القسم "${category.name || category.id}"؟`
                );

                if (!confirmed) return;

                try {
                    // التأكد من عدم وجود منتجات مرتبطة بالقسم
                    const productsQuery = query(
                        collection(db, "products"),
                        where("categoryId", "==", category.id)
                    );

                    const productsSnapshot = await getDocsFromServer(
                        productsQuery
                    );

                    if (!productsSnapshot.empty) {
                        alert(
                            "لا يمكن حذف هذا القسم لأنه يحتوي على منتجات مرتبطة به."
                        );
                        return;
                    }

                    await deleteDoc(
                        doc(db, "categories-v2", category.id)
                    );

                    alert("تم حذف القسم بنجاح.");

                    await loadAdminCategories();

                } catch (error) {
                    console.error("خطأ أثناء حذف القسم:", error);
                    alert("حدث خطأ أثناء حذف القسم.");
                }
            });

            card.appendChild(editButton);
            card.appendChild(deleteButton);

            categoryList.appendChild(card);
        });

    } catch (error) {
        console.error("خطأ أثناء تحميل الأقسام:", error);

        categoryList.innerHTML =
            "<p>تعذر تحميل الأقسام. تحقق من الاتصال والصلاحيات.</p>";
    }
}


// إضافة قسم جديد أو تعديل قسم موجود
if (categoryForm) {
    categoryForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const categoryName = categoryNameInput?.value.trim();
        const categoryId = categoryIdInput?.value.trim();

        if (!categoryName) {
            alert("يرجى إدخال اسم القسم.");
            return;
        }

        try {
            if (editingCategoryId) {
                // تعديل قسم موجود
                await updateDoc(
                    doc(db, "categories-v2", editingCategoryId),
                    {
                        name: categoryName
                    }
                );

                alert("تم تعديل القسم بنجاح.");

            } else {
                // إضافة قسم جديد
                if (!categoryId) {
                    alert("يرجى إدخال معرّف القسم.");
                    return;
                }

                const categoryRef = doc(
                    db,
                    "categories-v2",
                    categoryId
                );

                const existingCategory = await getDocFromServer(
                    categoryRef
                );

                if (existingCategory.exists()) {
                    alert("هذا المعرّف مستخدم مسبقاً. اختر معرّفاً آخر.");
                    return;
                }

                await setDoc(categoryRef, {
                    name: categoryName,
                    active: true,
                    order: Date.now()
                });

                alert("تمت إضافة القسم بنجاح.");
            }

            resetCategoryForm();
            await loadAdminCategories();

        } catch (error) {
            console.error("خطأ أثناء حفظ القسم:", error);
            alert("حدث خطأ أثناء حفظ القسم.");
        }
    });
}


// زر إلغاء التعديل
if (cancelCategoryEdit) {
    cancelCategoryEdit.addEventListener("click", resetCategoryForm);
}


// ==========================================
// نقل الأقسام القديمة إلى categories-v2
// ==========================================

async function migrateCategoriesToV2() {
    console.log("بدأ فحص الأقسام القديمة...");

    try {
        const oldSnapshot = await getDocsFromServer(
            collection(db, "categories")
        );

        let transferred = 0;
        let skipped = 0;

        for (const categoryDoc of oldSnapshot.docs) {
            const targetRef = doc(
                db,
                "categories-v2",
                categoryDoc.id
            );

            // عدم استبدال أي قسم موجود مسبقاً
            const targetSnapshot = await getDocFromServer(targetRef);

            if (targetSnapshot.exists()) {
                skipped++;
                continue;
            }

            await setDoc(targetRef, categoryDoc.data());
            transferred++;
        }

        console.log("انتهى فحص الأقسام القديمة.");
        console.log("عدد الأقسام المنقولة:", transferred);
        console.log("عدد الأقسام التي تم تخطيها:", skipped);

    } catch (error) {
        console.error(
            "تعذر نقل الأقسام القديمة، سنحاول تحميل الأقسام الجديدة:",
            error
        );

    } finally {
        await loadAdminCategories();
    }
}


// ==========================================
// تشغيل لوحة التحكم
// ==========================================
// ==========================================
// إدارة إعدادات الفرعين
// ==========================================

async function loadBranchSettings() {
    // بيانات التواصل مشتركة. نقرأ المستند الجديد أولاً، ثم نستخدم بيانات الفرع الأول القديمة كترحيل تلقائي.
    try {
        const sharedRef = doc(db, "settings", "shared");
        const sharedSnapshot = await getDocFromServer(sharedRef);
        let shared = sharedSnapshot.exists() ? sharedSnapshot.data() : {};
        if (!sharedSnapshot.exists()) {
            const legacy = await getDocFromServer(doc(db, "branches", "branch1"));
            if (legacy.exists()) shared = legacy.data();
        }
        document.getElementById("shared-whatsapp").value = shared.whatsapp || "0966242463";
        document.getElementById("shared-map").value = shared.mapUrl || "https://maps.app.goo.gl/gE4aAF8Uhq7jATkg7";
    } catch (error) {
        console.error("Shared settings load error:", error);
    }

    for (const branchId of ["branch1", "branch2"]) {
        try {
            const snapshot = await getDocFromServer(doc(db, "branches", branchId));
            if (!snapshot.exists()) continue;
            const branch = snapshot.data();
            document.getElementById(`${branchId}-address`).value = branch.address || "";
            const preview = document.getElementById(`${branchId}-qr-preview`);
            if (preview && branch.shamCashQrUrl) {
                preview.src = branch.shamCashQrUrl;
                preview.hidden = false;
            }
        } catch (error) {
            console.error(`Error loading ${branchId}:`, error);
        }
    }
}

// معاينة باركود شام كاش
["branch1", "branch2"].forEach(branchId => {
    const input = document.getElementById(`${branchId}-qr`);
    const preview = document.getElementById(`${branchId}-qr-preview`);
    if (!input || !preview) return;
    input.addEventListener("change", function () {
        const file = this.files[0];
        if (!file) return;
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
            alert("يرجى اختيار صورة JPG أو PNG أو WebP."); this.value = ""; return;
        }
        if (file.size > 5 * 1024 * 1024) {
            alert("حجم صورة الباركود يجب ألا يتجاوز 5 ميغابايت."); this.value = ""; return;
        }
        preview.src = URL.createObjectURL(file);
        preview.hidden = false;
    });
});

// حفظ بيانات التواصل المشتركة بين الفرعين
async function saveSharedSettings() {
    const whatsapp = document.getElementById("shared-whatsapp").value.trim();
    const mapUrl = document.getElementById("shared-map").value.trim();
    const button = document.getElementById("save-shared-settings");
    if (!whatsapp || !mapUrl) { alert("يرجى إدخال رقم واتساب ورابط الخريطة."); return; }
    button.disabled = true;
    try {
        await setDoc(doc(db, "settings", "shared"), { whatsapp, mapUrl, updatedAt: serverTimestamp() }, { merge: true });
        alert("تم حفظ بيانات التواصل المشتركة للفرعين.");
    } catch (error) {
        console.error("Shared settings save error:", error);
        alert("تعذر حفظ بيانات التواصل: " + error.message);
    } finally { button.disabled = false; }
}
document.getElementById("save-shared-settings")?.addEventListener("click", saveSharedSettings);

// حفظ عنوان وباركود كل فرع فقط
async function saveBranchSettings(branchId) {
    const address = document.getElementById(`${branchId}-address`).value.trim();
    const qrInput = document.getElementById(`${branchId}-qr`);
    const saveButton = document.getElementById(`save-${branchId}`);
    if (!address) { alert("يرجى إدخال عنوان الفرع."); return; }
    const branchRef = doc(db, "branches", branchId);
    let uploadedQr = null;
    let saved = false;
    try {
        saveButton.disabled = true;
        saveButton.textContent = "جارٍ الحفظ...";
        const oldSnapshot = await getDocFromServer(branchRef);
        const oldBranch = oldSnapshot.exists() ? oldSnapshot.data() : {};
        const qrFile = qrInput.files[0];
        if (qrFile) uploadedQr = await uploadProductImage(qrFile);
        const branchData = {
            address,
            shamCashQrUrl: uploadedQr ? uploadedQr.url : oldBranch.shamCashQrUrl || "",
            shamCashQrPath: uploadedQr ? uploadedQr.path : oldBranch.shamCashQrPath || "",
            updatedAt: serverTimestamp()
        };
        await setDoc(branchRef, branchData, { merge: true });
        saved = true;
        if (uploadedQr && oldBranch.shamCashQrPath && oldBranch.shamCashQrPath !== uploadedQr.path) {
            try { await deleteProductImages([oldBranch.shamCashQrPath]); }
            catch (deleteError) { console.error("Old QR deletion error:", deleteError); }
        }
        qrInput.value = "";
        const preview = document.getElementById(`${branchId}-qr-preview`);
        if (preview && branchData.shamCashQrUrl) { preview.src = branchData.shamCashQrUrl; preview.hidden = false; }
        alert("تم حفظ عنوان وباركود الفرع بنجاح.");
    } catch (error) {
        console.error("Branch save error:", error);
        if (uploadedQr && !saved) { try { await deleteProductImages([uploadedQr.path]); } catch (e) { console.error(e); } }
        alert("تعذر حفظ بيانات الفرع: " + error.message);
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = branchId === "branch1" ? "حفظ بيانات الفرع الأول" : "حفظ بيانات الفرع الثاني";
    }
}

document.getElementById("save-branch1")?.addEventListener("click", () => saveBranchSettings("branch1"));
document.getElementById("save-branch2")?.addEventListener("click", () => saveBranchSettings("branch2"));

// ==========================================
// تحويل الصور المرفوعة إلى منتجات
// ==========================================

const convertImagesButton = document.getElementById("convert-images-button");
const convertProgress = document.getElementById("convert-products-progress");
const convertSummary = document.getElementById("convert-products-summary");

if (convertImagesButton) {
  convertImagesButton.addEventListener("click", async function () {

    if (!auth.currentUser) {
      alert("يرجى تسجيل الدخول أولاً.");
      return;
    }

    const confirmed = confirm(
      "سيتم إنشاء منتج مستقل لكل صورة مرفوعة وغير محوّلة سابقاً. هل تريد المتابعة؟"
    );

    if (!confirmed) return;

    convertImagesButton.disabled = true;
    convertProgress.textContent = "جارٍ فحص الصور والأقسام والمنتجات...";
    convertSummary.textContent = "";

    try {
      // قراءة الأقسام والصور والمنتجات الحالية
      const [categoriesSnapshot, imagesSnapshot, productsSnapshot] =
        await Promise.all([
          getDocsFromServer(collection(db, "categories-v2")),
          getDocsFromServer(collection(db, "bulkImageUploads")),
          getDocsFromServer(collection(db, "products"))
        ]);

      // الأقسام النشطة
      const categoriesMap = new Map();

      categoriesSnapshot.forEach(categoryDoc => {
        const data = categoryDoc.data();

        if (data.active === true) {
          categoriesMap.set(categoryDoc.id, data.name || categoryDoc.id);
        }
      });

      // الصور المرفوعة فقط
      const uploadedImages = [];

      imagesSnapshot.forEach(imageDoc => {
        const data = imageDoc.data();

        if (
          data.status === "uploaded" &&
          data.url &&
          data.categoryId
        ) {
          uploadedImages.push({
            id: imageDoc.id,
            ...data
          });
        }
      });

      // ترتيب ثابت للصور
      uploadedImages.sort((a, b) => a.id.localeCompare(b.id));

      // التحقق من وجود جميع الأقسام المطلوبة قبل الإنشاء
      const missingCategories = [
        ...new Set(
          uploadedImages
            .filter(image => !categoriesMap.has(image.categoryId))
            .map(image => image.categoryId)
        )
      ];

      if (missingCategories.length > 0) {
        throw new Error(
          "هذه الأقسام غير موجودة أو غير نشطة في categories-v2: " +
          missingCategories.join(", ") +
          ". لم يتم إنشاء أي منتجات."
        );
      }

      // منع التكرار باستخدام معرف ثابت لكل صورة
      const existingProductIds = new Set();

      productsSnapshot.forEach(productDoc => {
        const data = productDoc.data();

        existingProductIds.add(productDoc.id);

        if (data.sourceImageId) {
          existingProductIds.add("bulk_" + data.sourceImageId);
        }
      });

      const productsToCreate = [];
      const categoryCounters = {};

      uploadedImages.forEach(image => {
        const productId = "bulk_" + image.id;

        if (existingProductIds.has(productId)) return;

        const categoryId = image.categoryId;

        categoryCounters[categoryId] =
          (categoryCounters[categoryId] || 0) + 1;

        const serial = String(categoryCounters[categoryId]).padStart(3, "0");

        productsToCreate.push({
          id: productId,
          data: {
            name: categoriesMap.get(categoryId) + " " + serial,
            description: "يمكنكم التواصل معنا للاستفسار عن تفاصيل هذه التنسيقة.",
            categoryId: categoryId,
            images: [image.url],
            active: true,
            order: Date.now() + productsToCreate.length,
            source: "bulkImageUploads",
            sourceImageId: image.id,
            createdAt: serverTimestamp()
          }
        });
      });

      if (productsToCreate.length === 0) {
        convertProgress.textContent = "لا توجد صور جديدة تحتاج إلى تحويل.";
        convertSummary.textContent =
          "عدد الصور المرفوعة: " + uploadedImages.length +
          " | المنتجات الجديدة: 0";
        return;
      }

      // الحفظ على دفعات من 200 منتج
      const BATCH_SIZE = 200;
      let createdCount = 0;

      for (let i = 0; i < productsToCreate.length; i += BATCH_SIZE) {

        const currentBatch = productsToCreate.slice(
          i,
          i + BATCH_SIZE
        );

        const batch = writeBatch(db);

        currentBatch.forEach(product => {
          batch.set(
            doc(db, "products", product.id),
            product.data
          );
        });

        await batch.commit();

        createdCount += currentBatch.length;

        convertProgress.textContent =
          "تم إنشاء " + createdCount +
          " من " + productsToCreate.length + " منتج...";
      }

      convertProgress.textContent = "اكتمل تحويل الصور بنجاح.";

      convertSummary.textContent =
        "الصور المرفوعة: " + uploadedImages.length +
        " | المنتجات التي أُنشئت: " + createdCount +
        " | الصور التي كانت محوّلة مسبقاً: " +
        (uploadedImages.length - createdCount);

      // تحديث قائمة المنتجات في لوحة التحكم
      await loadAdminProducts();

    } catch (error) {
      console.error("Bulk conversion error:", error);

      convertProgress.textContent = "تعذر إكمال عملية التحويل.";

      convertSummary.textContent = error.message;

      alert("حدث خطأ أثناء تحويل الصور: " + error.message);

    } finally {
      convertImagesButton.disabled = false;
    }

  });
}
onAuthStateChanged(auth, async (user) => {
    if (!user || (user.email || "").toLowerCase() !== "salerflowerlg@gmail.com") {
        try { if (user) await signOut(auth); } catch (error) { console.error("Sign-out error:", error); }
        window.location.replace("admin.html");
        return;
    }
    loadAdminCategories();
    loadAdminProducts();
    loadBranchSettings();
});