import { auth, db } from "./firebase.js";

import {
    collection,
    doc,
    getDocs,
    setDoc,
    updateDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// =====================================================
// لجين فلاورز - مستورد الصور الجماعي
// يفحص المجلدات، يتجاوز الصور المسجلة، ويرفع الصور تدريجياً
// لا ينشئ منتجات؛ يسجل الصور في bulkImageUploads فقط.
// =====================================================

const SUPABASE_UPLOAD_URL =
    "https://wwqzhckptibzltizaqnf.supabase.co/functions/v1/upload-product-image";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const WORKERS = 2; // صورتان بالتوازي
const BATCH_SIZE = 100; // كل ضغطة ترفع 100 صورة كحد أقصى

const bulkFolderInput = document.getElementById("bulk-folder");
const scanFolderButton = document.getElementById("scan-folder-button");
const confirmScanButton = document.getElementById("confirm-scan-button");
const importButton = document.getElementById("test-upload-button");
const saveTestRecordsButton = document.getElementById("save-test-records-button");
const bulkSummary = document.getElementById("bulk-import-summary");
const bulkProgress = document.getElementById("bulk-import-progress");
const preview = document.getElementById("bulk-images-preview");

const folderCategoryMap = {
    "باقات_طبيعي": "natural",
    "تنسيقات": "arrangements",
    "صالات": "wedding",
    "سيارات": "car-decor",
    "باقات_عروس": "bridal-bouquet",
    "تابوريات": "tabouriyat",
    "تخرج": "graduation",
    "تنسيقات_ذهب": "gold-stands",
    "ولادة": "newborn",
    "بولين": "balloons"
};

// الصور العشرون التي رُفعت سابقاً وحُفظت سجلاتها.
// نستخدم اسم الملف + القسم للتعرف عليها، لأن سجلها القديم لا يحتوي relativePath.
const previouslyRegisteredFiles = new Set([
    "natural|1714318216379_result.webp",
    "natural|1714904837813_result.webp",
    "natural|1714904837841_result.webp",
    "natural|1715357142145_result.webp",
    "natural|1715357142172_result.webp",
    "natural|1715357142285_result.webp",
    "natural|1718364870065_result.webp",
    "natural|1718364870091_result.webp",
    "natural|1719411866591_result.webp",
    "natural|1719411866861_result.webp",
    "natural|1719411867182_result.webp",
    "natural|1719411867586_result.webp",
    "natural|1719411867635_result.webp",
    "natural|1719411867704_result.webp",
    "natural|1722259672026_result.webp",
    "natural|1722259672043_result.webp",
    "natural|1722259672078_result.webp",
    "natural|1722260199434_result.webp",
    "natural|1724422940425_result.webp",
    "natural|1724422940456_result.webp"
]);

let selectedFiles = [];
let categorizedImages = {};
let scanCompleted = false;
let scanConfirmed = false;
let importRunning = false;

function setStatus(message) {
    if (bulkProgress) bulkProgress.textContent = message;
}

function getDocumentId(relativePath) {
    // encodeURIComponent يحوّل / إلى %2F، وبذلك يصبح المسار صالحاً كمعرّف مستند.
    return encodeURIComponent(relativePath);
}

function renderPreview(images) {
    if (!preview) return;
    preview.innerHTML = "";
    preview.style.display = "grid";
    preview.style.gridTemplateColumns = "repeat(3, minmax(0, 1fr))";
    preview.style.gap = "12px";
    preview.style.marginTop = "20px";

    images.slice(0, 60).forEach(imageData => {
        if (!imageData.url) return;
        const image = document.createElement("img");
        image.src = imageData.url;
        image.alt = imageData.fileName || "صورة من الكتالوج";
        image.loading = "lazy";
        image.style.width = "100%";
        image.style.aspectRatio = "1 / 1";
        image.style.objectFit = "cover";
        image.style.borderRadius = "10px";
        preview.appendChild(image);
    });
}

// -----------------------------------------------------
// اختيار مجلد الصور
// -----------------------------------------------------
if (bulkFolderInput) {
    bulkFolderInput.addEventListener("change", function () {
        selectedFiles = Array.from(this.files || []);
        categorizedImages = {};
        scanCompleted = false;
        scanConfirmed = false;
        if (confirmScanButton) confirmScanButton.disabled = true;
        if (importButton) importButton.disabled = true;
        if (bulkSummary) bulkSummary.textContent = "";

        if (!selectedFiles.length) {
            setStatus("لم يتم اختيار أي ملفات.");
            return;
        }
        setStatus(`تم اختيار ${selectedFiles.length} ملف. اضغط فحص المجلد للمتابعة.`);
    });
}
// -----------------------------------------------------
// فحص الملفات وتصنيفها
// -----------------------------------------------------
if (scanFolderButton) {
    scanFolderButton.addEventListener("click", function () {
        if (!selectedFiles.length) {
            alert("يرجى اختيار مجلد الصور أولاً.");
            return;
        }

        categorizedImages = {};
        let totalImages = 0;
        let invalidImages = 0;
        const unknownFolders = new Set();

        selectedFiles.forEach(file => {
            const pathParts = (file.webkitRelativePath || "").split("/");
            if (pathParts.length < 3) {
                invalidImages++;
                return;
            }

            const folderName = pathParts[1];
            const extension = file.name.split(".").pop().toLowerCase();
            if (extension !== "webp") {
                invalidImages++;
                return;
            }
            if (!folderCategoryMap[folderName]) {
                unknownFolders.add(folderName);
                return;
            }

            if (!categorizedImages[folderName]) categorizedImages[folderName] = [];
            categorizedImages[folderName].push({
                file,
                categoryId: folderCategoryMap[folderName],
                relativePath: file.webkitRelativePath
            });
            totalImages++;
        });

        let html = `
            <h3>نتيجة فحص الصور</h3>
            <p>عدد الملفات المختارة: ${selectedFiles.length}</p>
            <p>الصور المصنفة بنجاح: ${totalImages}</p>
            <p>الملفات غير المطابقة: ${invalidImages}</p>
            <h4>تفاصيل الأقسام</h4>
        `;

        Object.entries(folderCategoryMap).forEach(([folderName, categoryId]) => {
            const count = categorizedImages[folderName]?.length || 0;
            html += `<p>${folderName} — ${count} صورة (${categoryId})</p>`;
        });

        if (unknownFolders.size) {
            html += `<h4>مجلدات غير معروفة</h4><p>${Array.from(unknownFolders).join("، ")}</p>`;
        }
        if (bulkSummary) bulkSummary.innerHTML = html;

        const allFilesCategorized =
            totalImages === selectedFiles.length &&
            invalidImages === 0 &&
            unknownFolders.size === 0;

        scanCompleted = true;
        scanConfirmed = false;
        if (confirmScanButton) confirmScanButton.disabled = !allFilesCategorized;
        if (importButton) importButton.disabled = true;

        if (allFilesCategorized) {
            setStatus(`اكتمل الفحص بنجاح. تم تصنيف ${totalImages} صورة. راجع الأقسام ثم اضغط تأكيد الفحص.`);
        } else {
            setStatus("الفحص غير مكتمل. راجع الملفات غير المطابقة ومجلدات الأقسام.");
        }
        console.log("نتيجة فحص الصور:", categorizedImages);
    });
}

// -----------------------------------------------------
// تأكيد نتيجة الفحص
// -----------------------------------------------------
if (confirmScanButton) {
    confirmScanButton.addEventListener("click", function () {
        if (!scanCompleted || !Object.keys(categorizedImages).length) {
            alert("يجب فحص المجلد بنجاح أولاً.");
            return;
        }
        scanConfirmed = true;
        confirmScanButton.disabled = true;
        if (importButton) {
            importButton.disabled = false;
            importButton.textContent = "بدء استيراد الصور";
        }
        setStatus("تم تأكيد الفحص. يمكنك الآن بدء الاستيراد التدريجي.");
        console.log("تم تأكيد الفحص:", { totalFiles: selectedFiles.length, categorizedImages });
    });
}

// -----------------------------------------------------
// قراءة سجلات Firestore وبناء مفاتيح منع التكرار
// -----------------------------------------------------
async function loadExistingRecords() {
    const snapshot = await getDocs(collection(db, "bulkImageUploads"));
    const uploadedByPath = new Map();
    const legacyByName = new Set(previouslyRegisteredFiles);
    const uncertainByPath = new Set();

    snapshot.forEach(record => {
        const data = record.data();
        if (data.status === "uploaded" && data.relativePath) {
            uploadedByPath.set(data.relativePath, data);
        } else if (data.status === "uploading" || data.status === "needs-review") {
            if (data.relativePath) uncertainByPath.add(data.relativePath);
        }
        if (data.status === "uploaded" && data.categoryId && data.fileName) {
            legacyByName.add(`${data.categoryId}|${data.fileName}`);
        }
    });

    return { uploadedByPath, legacyByName, uncertainByPath, totalRecords: snapshot.size };
}
async function uploadOneImage(item, user, existing) {
    const { file, categoryId, relativePath } = item;
    const recordId = getDocumentId(relativePath);
    const recordRef = doc(db, "bulkImageUploads", recordId);

    // السجل المسجل سابقاً يتجاوز دون رفع جديد.
    if (existing.uploadedByPath.has(relativePath) ||
        existing.legacyByName.has(`${categoryId}|${file.name}`)) {
        return "skipped";
    }

    // لا نعيد محاولة سجل غير محسوم تلقائياً كي لا ننشئ نسخة مكررة في Storage.
    if (existing.uncertainByPath.has(relativePath)) {
        return "review";
    }

    if (file.size > MAX_FILE_SIZE) {
        throw new Error(`حجم الملف أكبر من 5MB: ${relativePath}`);
    }

    // نكتب حالة أولية قبل الرفع. إذا انقطع المتصفح لا يعاد رفع الملف بشكل أعمى.
    await setDoc(recordRef, {
        relativePath,
        fileName: file.name,
        categoryId,
        status: "uploading",
        startedAt: serverTimestamp()
    });

    try {
        const token = await user.getIdToken();
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(SUPABASE_UPLOAD_URL, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: formData
        });

        let result;
        try {
            result = await response.json();
        } catch {
            throw new Error(`استجابة غير مفهومة من خدمة رفع الصور (${response.status})`);
        }

        if (!response.ok || !result?.success || !result?.url || !result?.path) {
            throw new Error(result?.error || `فشل رفع الملف: ${file.name}`);
        }

        await updateDoc(recordRef, {
            url: result.url,
            path: result.path,
            fileName: file.name,
            relativePath,
            categoryId,
            status: "uploaded",
            uploadedAt: serverTimestamp()
        });

        existing.uploadedByPath.set(relativePath, {
            url: result.url,
            path: result.path,
            fileName: file.name,
            categoryId,
            status: "uploaded",
            relativePath
        });
        existing.legacyByName.add(`${categoryId}|${file.name}`);
        return "uploaded";
    } catch (error) {
        // تبقى حالة uploading للمراجعة اليدوية، منعاً لإعادة الرفع المكرر.
        console.error("تعذر إكمال الصورة:", relativePath, error);
        throw error;
    }
}

// -----------------------------------------------------
// الاستيراد الكامل على دفعات صغيرة وبعاملَي رفع
// -----------------------------------------------------
if (importButton) {
    importButton.addEventListener("click", async function () {
        if (!scanConfirmed) {
            alert("يجب تأكيد فحص المجلد أولاً.");
            return;
        }
        if (importRunning) return;

        const user = auth.currentUser;
        if (!user) {
            alert("يجب تسجيل الدخول إلى لوحة التحكم أولاً.");
            return;
        }

        const allImages = Object.values(categorizedImages).flat();
        if (!allImages.length) {
            setStatus("لا توجد صور للاستيراد.");
            return;
        }

        const oversized = allImages.filter(item => item.file.size > MAX_FILE_SIZE);
        if (oversized.length) {
            alert(`يوجد ${oversized.length} ملف يتجاوز 5MB. لم يبدأ الاستيراد. راجع Console لمعرفة المسارات.`);
            console.table(oversized.map(item => ({ file: item.relativePath, sizeMB: (item.file.size / 1024 / 1024).toFixed(2) })));
            return;
        }

        importRunning = true;
        this.disabled = true;
        if (bulkFolderInput) bulkFolderInput.disabled = true;
        if (scanFolderButton) scanFolderButton.disabled = true;
        if (confirmScanButton) confirmScanButton.disabled = true;

        let uploaded = 0;
        let skipped = 0;
        let review = 0;
        let failed = 0;
        let cursor = 0;

        try {
            setStatus("جارٍ قراءة سجلات الصور الموجودة في Firestore...");
            const existing = await loadExistingRecords();

            // أول خمس صور من قسم باقات طبيعي هي اختبار الرفع الأول.
            // مساراتها غير محفوظة، لذلك نستثنيها من إعادة الرفع منعاً للتكرار.
            const naturalImages = categorizedImages["باقات_طبيعي"] || [];
            const firstFiveTestPaths = new Set(
                naturalImages.slice(0, 5).map(item => item.relativePath)
            );

            const candidates = allImages.filter(item => !firstFiveTestPaths.has(item.relativePath));

            // استبعاد الصور المكتملة، والأسماء القديمة المسجلة، والسجلات التي تحتاج مراجعة.
            const pending = candidates.filter(item =>
                !existing.uploadedByPath.has(item.relativePath) &&
                !existing.legacyByName.has(`${item.categoryId}|${item.file.name}`) &&
                !existing.uncertainByPath.has(item.relativePath)
            );

            const reviewCount = candidates.filter(item =>
                existing.uncertainByPath.has(item.relativePath)
            ).length;

            const batch = pending.slice(0, BATCH_SIZE);
            const remainingAfterBatch = Math.max(0, pending.length - batch.length);

            if (!batch.length) {
                setStatus(
                    `لا توجد صور جديدة جاهزة للرفع.\n` +
                    `الصور المستثناة من الاختبار الأول: ${firstFiveTestPaths.size}\n` +
                    `سجلات تحتاج مراجعة: ${reviewCount}\n` +
                    `قد تكون كل الصور المتبقية مسجلة مسبقاً.`
                );
                return;
            }
            const proceed = confirm(
                `دفعة الاستيراد الحالية: ${batch.length} صورة كحد أقصى.\n` +
                `صور جاهزة قبل هذه الدفعة: ${pending.length}\n` +
                `صور ستبقى بعد هذه الدفعة: ${remainingAfterBatch}\n` +
                `صور مستثناة من الاختبار الأول: ${firstFiveTestPaths.size}\n` +
                `سجلات تحتاج مراجعة: ${reviewCount}\n\n` +
                `سيُحفظ سجل كل صورة بعد نجاح رفعها. هل تريد رفع هذه الدفعة؟`
            );
            if (!proceed) {
                setStatus("تم إلغاء الدفعة قبل رفع أي صورة.");
                return;
            }

            const worker = async () => {
                while (true) {
                    const index = cursor++;
                    if (index >= batch.length) return;
                    const item = batch[index];
                    try {
                        const result = await uploadOneImage(item, user, existing);
                        if (result === "uploaded") uploaded++;
                        else if (result === "skipped") skipped++;
                        else if (result === "review") review++;
                    } catch (error) {
                        failed++;
                        console.error("فشل استيراد صورة:", item.relativePath, error);
                    }
                    const completed = uploaded + skipped + review + failed;
                    setStatus(
                        `الدفعة الحالية: ${completed} من ${batch.length}\n` +
                        `رُفعت: ${uploaded} | تم تجاوزها: ${skipped} | تحتاج مراجعة: ${review} | فشلت: ${failed}`
                    );
                }
            };

            await Promise.all(Array.from({ length: WORKERS }, () => worker()));

            setStatus(
                `انتهت الدفعة الحالية.\n` +
                `رُفعت بنجاح: ${uploaded} من ${batch.length}\n` +
                `فشلت: ${failed}\n` +
                `صور جاهزة متبقية تقريباً: ${remainingAfterBatch}\n` +
                `سجلات تحتاج مراجعة: ${reviewCount}\n\n` +
                (remainingAfterBatch > 0
                    ? "اضغط زر الاستيراد مرة أخرى لرفع الدفعة التالية بعد مراجعة النتيجة."
                    : "لا توجد دفعات أخرى جاهزة وفق السجلات الحالية.")
            );
            console.log("ملخص الدفعة:", {
                uploaded,
                skipped,
                review: reviewCount,
                failed,
                batchSize: batch.length,
                remainingAfterBatch
            });
        } catch (error) {
            console.error("خطأ في عملية الاستيراد:", error);
            setStatus(`توقف الاستيراد بسبب خطأ: ${error.message}. راجع Console.`);
        } finally {
            importRunning = false;
            this.disabled = false;
            if (bulkFolderInput) bulkFolderInput.disabled = false;
            if (scanFolderButton) scanFolderButton.disabled = false;
            if (confirmScanButton) confirmScanButton.disabled = !scanCompleted;
        }
    });
}

// زر حفظ سجلات الاختبار القديم لم يعد مطلوباً، لأن السجلات العشرين موجودة بالفعل.
if (saveTestRecordsButton) {
    saveTestRecordsButton.disabled = true;
    saveTestRecordsButton.title = "سجلات الصور التجريبية محفوظة مسبقاً في Firestore";
}

// -----------------------------------------------------
// عرض الصور المسجلة حالياً في Firestore
// -----------------------------------------------------
async function showSavedImages() {
    try {
        const snapshot = await getDocs(collection(db, "bulkImageUploads"));
        const savedImages = snapshot.docs
            .map(record => record.data())
            .filter(data => data.status === "uploaded" && data.url)
            .filter(data => data.categoryId === "natural");

        console.log("إجمالي سجلات الصور:", snapshot.size);
        console.log("صور باقات طبيعي المسجلة:", savedImages.length);
        renderPreview(savedImages);
    } catch (error) {
        console.error("خطأ قراءة سجلات الصور:", error);
    }
}

showSavedImages();
console.log("تم تحميل مستورد الصور الجماعي بنجاح.");