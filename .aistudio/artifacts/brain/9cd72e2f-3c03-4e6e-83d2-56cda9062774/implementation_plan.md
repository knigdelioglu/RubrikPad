# RubrikPad Tablet Odaklı Değerlendirme ve Grup Değerlendirme Arayüzü Dönüşüm Planı (Revize)

Bireysel değerlendirme ve grup değerlendirme ekranlarını sıkışık tablo görünümünden çıkararak; ortak bir dokunmatik rubrik kartı ve seviye seçici mimarisi üzerinde çalışan, **Açıklamalı** ve **Hızlı** görünüm modlarına sahip, grup değerlendirmede **Puanlanıyor → Tamamlandı → Üyelere Uygulandı** adımlarını açıkça yöneten modern bir tablet çalışma alanına dönüştürür.

## Kullanıcı Onayı ve Kritik Tasarım Kararları

> [!IMPORTANT]
> Geri bildiriminiz doğrultusunda plan aşağıdaki 5 temel ilkeyi eksiksiz karşılayacak şekilde revize edilmiştir. İnceleyip onayladığınızda kodlama aşamasına geçilecektir.

- **Revize Karar 1 — Ortak Rubrik Kartı ve Seviye Seçici Mimarisi**: Bireysel değerlendirme ve grup değerlendirme ekranları, aynı paylaşımlı **Dokunmatik Rubrik Kartı** ve **Seviye Seçici** bileşenlerini kullanacak. Böylece her iki modda da görsel dil, dokunma hedefleri, hassas tam sayı puan girişi ve ölçüt sıfırlama davranışları birebir tutarlı çalışacak.
- **Revize Karar 2 — Çift Yoğunluklu Görünüm Modu (Açıklamalı Görünüm & Hızlı Görünüm)**: Üst araç çubuğunda her an tek dokunuşla değiştirilebilen iki görünüm modu yer alacak:
  - **Açıklamalı Görünüm (Varsayılan)**: Büyük dokunmatik seviye kutuları (`min-h-[76px]`), seviye etiketleri ve uzun metinlerde bile taşmayan tam pedagojik seviye açıklamaları.
  - **Hızlı Görünüm**: Açıklamaları gizleyen, tüm ölçütlerin tek tablet ekranına sığmasını sağlayan kompakt dokunmatik puan ve seviye kutuları (`min-h-[48px]`).
- **Revize Karar 3 — Akıllı Otomatik Geçiş ve Kolay Geri Dönüş**: Otomatik geçiş **yalnızca daha önce eksik olan son ölçüt ilk kez puanlandığında** (`wasComplete === false` → `isComplete === true`) tetiklenecek. Zaten tamamlanmış bir öğrencinin veya grubun mevcut puanını düzeltirken/güncellerken otomatik geçiş **kesinlikle tetiklenmeyecek**. Geçiş sonrasında sabit bildirim çubuğundaki **"← Önceki Öğrenciye / Gruba Dön"** ve **"Geri Al"** düğmeleriyle tek dokunuşta geri dönülebilecek.
- **Revize Karar 4 — Üç Aşamalı Grup Değerlendirme Yaşam Döngüsü (Puanlanıyor → Tamamlandı → Üyelere Uygulandı)**: Grup değerlendirmede üyelere puan dağıtımı adımı asla atlanmayacak ve otomatik geçiş bu adımı ezerek geçmeyecek. Her takım kartı ve grup başlığı şu 3 durumu ayrı renk, ikon ve aksiyonla gösterecek:
  1. **Puanlanıyor** (`X/Y Ölçüt` — Taslak, kesin not gösterilmez).
  2. **Tamamlandı (Üyelere Uygulanmayı Bekliyor)** (Tüm ölçütler puanlandı, grup notu hesaplandı ancak henüz üyelere yansıtılmadı; birincil aksiyon: **"Grup Puanını Üyelere Uygula"**).
  3. **Üyelere Uygulandı** (Grup puanları üye öğrencilerin kayıtlarına güncel olarak aktarıldı; grup puanı sonradan değiştirilirse durum tekrar *"Güncelleme Bekliyor"* rozetine döner).
- **Revize Karar 5 — Dikey/Yatay Tablet Ergonomisi, Büyük Sınıf Yönetimi ve Kesin Not Kuralı**:
  - Eksik değerlendirmelerde (`isComplete === false`) hiçbir ekranda **kesin not (`100` üzerinden puan) gösterilmeyecek**; yalnızca tamamlanan ölçüt sayısı (`Taslak · 3/5 Ölçüt`) gösterilecek.
  - Yatay tabletlerde (`lg` / `1024px+`) sabit sol öğrenci/grup listesi + sağ rubrik kartları; dikey tabletlerde (`768px–1023px`) ise üstte yatay kaydırılabilir/daraltılabilir hızlı öğrenci/grup seçici şeridi + tam genişlikte rubrik kartları düzeni kullanılacak.
  - Matris görünümü ikincil bir **"Toplu Matris Özeti"** görünümü olarak korunacak ve mevcut veri modeli ile puanlama mantığı birebir muhafaza edilecek.

---

## 1. Genel Bakış ve Temel Konsept

- **Ne Yapar**: Öğretmenlerin hem bireysel öğrenci değerlendirmelerini hem de takım/proje değerlendirmelerini aynı ergonomik dokunmatik rubrik kartları üzerinden yürütmesini sağlar; öğretmenin ihtiyacına göre **Açıklamalı** (pedagojik rehberlik odaklı) ve **Hızlı** (seri puanlama odaklı) modlar arasında anında geçiş imkânı sunar.
- **Hedef Kitle ve Kullanım Bağlamı**: Kalabalık sınıflarda (30–40+ öğrenci) dikey veya yatay tutulan tabletlerle ders içi gözlem, sözlü sunum veya grup projesi değerlendirmesi yapan öğretmenler.
- **Temel Değer Önerisi**:
  - Tekrarlanan kod veya farklılaşan arayüzler yerine bireysel ve grup modunda **aynı rubrik kartı ve seviye seçici deneyimi**.
  - Mevcut puanı düzeltirken istenmeyen ekran atlamalarını önleyen **yalnızca son eksik ölçüt tamamlandığında çalışan akıllı otomatik geçiş**.
  - Grup puanlarının üyelere yansıtılıp yansıtılmadığını şeffaf biçimde takip eden **Puanlanıyor → Tamamlandı → Üyelere Uygulandı** durum makinesi.

---

## 2. Kullanıcı Deneyimi ve Görsel Tasarım

### Temel Kullanıcı Akışları

1. **Ortak Rubrik Kartı ve Görünüm Modu Geçişi (Açıklamalı ↔ Hızlı)**:
   - Değerlendirme başlığında **"Açıklamalı Görünüm"** ve **"Hızlı Görünüm"** segment seçicisi bulunur.
   - **Açıklamalı Görünümde**: Her ölçüt kartı; ölçüt numarası, başlığı, ağırlık/maksimum puan rozeti ve altında geniş seviye kutularından (`grid-cols-1 sm:grid-cols-2 xl:grid-cols-4/5`) oluşur. Uzun seviye açıklamaları okunaklı tipografiyle (`leading-relaxed`, `line-clamp` olmadan tam metin veya temiz kart içi akış) gösterilir.
   - **Hızlı Görünümde**: Aynı ortak rubrik kartı bileşeni kompakt moda (`density="compact"`) geçer; açıklamalar gizlenir, ölçüt başlığı sol sütunda, büyük dokunmatik puan/etiket kutuları (`4P · Çok İyi`) sağ sütunda yer alır. Böylece 5–8 ölçütlü bir rubrik bile kaydırma gerektirmeden tek ekrana sığar.

2. **Bireysel Değerlendirme ve Akıllı Otomatik Geçiş Akışı**:
   - **Büyük Sınıflar İçin Hızlı Öğrenci Seçici**: Öğrenci listesinde anlık arama (isim veya numara), durum filtre sekmeleri (*Tümü*, *Bekleyenler*, *Tamamlananlar*) ve aktif öğrencinin otomatik görünür alana kaydırılması (`scrollIntoView`) bulunur.
   - **Kesin Not Disiplini**: Öğrencinin tüm ölçütleri tamamlanmadan (`isComplete === false`) öğrenci kartında veya üst barda kesin puan gösterilmez; yalnızca `Taslak (3/5 Ölçüt)` rozeti yer alır. Tüm ölçütler tamamlandığında `Kesin Not: 88 / 100 · İyi` rozeti aktifleşir.
   - **Son Eksik Ölçüt Kuralı**:
     - Öğrencinin 4/5 ölçütü doluyken öğretmen 5. (son eksik) ölçüte dokunduğunda değerlendirme `Tamamlandı` durumuna geçer. Otomatik geçiş açıksa, sıradaki eksik öğrenciye geçilir ve ekranın üst/alt barında **"Ayşe Yılmaz tamamlandı (88/100) · [← Ayşe Yılmaz'a Dön] · [Geri Al]"** çubuğu sabitlenir.
     - Öğretmen geri dönüp zaten `5/5` tamamlanmış olan Ayşe Yılmaz'ın herhangi bir ölçüt puanını değiştirdiğinde (`wasComplete === true`), puan anında güncellenir ancak **otomatik geçiş tetiklenmez**; öğretmen aynı öğrencide kalmaya devam eder.

3. **Grup Değerlendirme: Puanlanıyor → Tamamlandı → Üyelere Uygulandı Akışı**:
   - **Görsel Takım Kartları**: Her takım kartında grup adı, üye avatar rozetleri, üye sayısı ve 3 aşamalı durum rozeti yer alır:
     - 🟡 **Puanlanıyor (`2/5 Ölçüt`)**: Eksik ölçütler var; kesin grup notu henüz gösterilmez.
     - 🔵 **Tamamlandı — Üyelere Uygulanmayı Bekliyor (`90 / 100`)**: Tüm grup ölçütleri puanlandı ve grup notu hesaplandı, ancak puanlar henüz grup üyelerinin bireysel kayıtlarına dağıtılmadı (veya son dağıtımdan sonra grup puanı/üyeleri değişti).
     - 🟢 **Üyelere Uygulandı (`90 / 100 · N Üyeye Aktarıldı`)**: Grup puanları ve grup notu tüm mevcut grup üyelerine eksiksiz yansıtıldı.
   - **Üyelere Uygulama Adımının Korunması**:
     - Bir grubun son eksik ölçütü puanlandığında grup durumu **Tamamlandı (Üyelere Uygulanmayı Bekliyor)** olur ve grup başlığında dikkat çekici **"Grup Puanını Üyelere Uygula (N Öğrenci)"** birincil eylem çubuğu vurgulanır.
     - Eğer grup üzerinde daha önce üyelere dağıtılmış puanlar varsa, mevcut yeniden dağıtım onay koruması (*Üzerine Yaz / Bireysel Farkları Koru*) devreye girer.
     - Öğretmen **"Üyelere Uygula"** işlemini onayladığında durum **Üyelere Uygulandı** olur; eğer "Otomatik Sıradaki Gruba Geç" açıksa geçiş bu uygulama adımı tamamlandıktan sonra (veya öğretmenin tek dokunuşlu *"Uygula ve Sıradaki Gruba Geç"* butonuyla) gerçekleşir. Böylece üyelere uygulama adımı hiçbir zaman yanlışlıkla atlanmaz.

### Dikey ve Yatay Tablet Düzeni (Responsive Ergonomi)

- **Yatay Tablet ve Masaüstü (`1024px+` / `lg` ve üzeri)**:
  - **2 Sütunlu Bölünmüş Çalışma Alanı**: Sol sütunda (`300px–340px` sabit genişlik, bağımsız dikey kaydırma) filtrelenebilir Öğrenci Listesi veya Görsel Takım Kartları; sağ sütunda ise sabit durum başlığı (Sticky Header) ve ortak Rubrik Kartları listesi.
- **Dikey Tablet (`768px–1023px` / `md`)**:
  - **Üst Seçici Çekmecesi + Tam Genişlikli Rubrik Kartları**: Dikey tablette yan sütun rubrik kartlarını daraltmaması için öğrenci/grup listesi üstte kompakt bir **"Aktif Öğrenci / Grup Seçici Şeridi"** (Önceki / Seçili Öğrenci Kartı + Açılır Liste Çekmecesi / Sonraki) haline gelir; böylece rubrik seviye kutuları tam ekran genişliğini kullanarak geniş ve okunaklı kalır.
- **Uzun Açıklama Metinleri Ergonomisi**:
  - Seviye kutuları `flex-col justify-between` yapısıyla üstte net puan ve seviye etiketini, altta ise tam seviye açıklamasını barındırır.
  - Çok uzun açıklamaya sahip ölçütlerde kutular eşit yükseklikte (`items-stretch`) genişler; metin kesilmez (`truncate` edilmez) ve satır yüksekliği (`leading-snug`) tablet okuma mesafesine göre optimize edilir.

---

## 3. Temel Ürün Kararları ve Ödünleşimler

- **Karar 1: Tek Ortak `<RubricCriterionCard />` Bileşeni**
  - *Seçilen Yaklaşım*: Hem bireysel değerlendirme hem grup değerlendirme hem de hızlı görünüm için tek bir parametrik `<RubricCriterionCard />` ve `<RubricLevelSelector />` bileşeni oluşturmak (`viewMode: 'detailed' | 'compact'`, `precisionMode: boolean`).
  - *Neden*: Kod tekrarını önler, klavye/dokunmatik erişilebilirliğini tek merkezden sağlar ve öğretmenin bireysel ile grup ekranları arasında geçerken sıfır bilişsel yabancılık yaşamasını garanti eder.

- **Karar 2: Otomatik Geçişin Yalnızca `wasComplete === false && nowComplete === true` Geçişinde Çalışması**
  - *Seçilen Yaklaşım*: Ölçüt puanlama işleyicisinde işlem öncesi tamamlanma durumu (`wasComplete`) ile işlem sonrası tamamlanma durumu (`nowComplete`) karşılaştırılır. Yalnızca ` !wasComplete && nowComplete ` olduğunda otomatik geçiş tetiklenir.
  - *Neden*: Öğretmen tamamlanmış bir öğrencinin notunu revize ederken veya farklı bir seviyeyi denerken ekranın aniden başka öğrenciye atlaması ciddi bir kullanıcı deneyimi hatasıdır. Bu kural yalnızca gerçek "ilk kez tamamlama" anında geçiş yapar.

- **Karar 3: Grup Durumunun Veri Modelini Bozmadan Türetilmesi ve Takibi**
  - *Seçilen Yaklaşım*: Mevcut `StudentGroup`, `GroupEvaluation` ve `StudentEvaluation` veri yapılarını değiştirmeden; bir grubun üyelerinin `groupCriterionScores` ve `groupDirectScores` kayıtlarının grup değerlendirmesiyle birebir eşleşip eşleşmediğini kontrol eden saf bir yardımcı fonksiyon (`getGroupSyncStatus`) ile **Puanlanıyor**, **Tamamlandı (Uygulanmayı Bekliyor)** ve **Üyelere Uygulandı** durumlarını kesin olarak hesaplamak.
  - *Neden*: Mevcut SHA-256 yedekleme şeması ve v3 veri modeliyle %100 geriye dönük uyumlu kalırken, grup puanı değiştirildiğinde veya gruba yeni üye eklendiğinde "Üyelere Uygulandı" durumunun otomatik olarak "Güncelleme/Uygulama Bekliyor" durumuna düşmesini sağlar.

---

## 4. Teknik Mimari ve Veri Stratejisi

### Mimari ve Bileşen Diyagramı

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                     Değerlendirme Çalışma Alanı (HUD)                        │
│  Mod: [Bireysel] [Grup] [Toplu Matris (İkincil)]                             │
│  Görünüm: [Açıklamalı Kartlar | Hızlı Kompakt]   [Otomatik Geçiş] [Geri Al]  │
└───────────────────┬──────────────────────────────────────┬───────────────────┘
                    │                                      │
                    ▼                                      ▼
┌───────────────────────────────────────┐  ┌───────────────────────────────────┐
│     Bireysel Değerlendirme Görünümü   │  │     Grup Değerlendirme Görünümü   │
│                                       │  │                                   │
│ • Yatay/Dikey Uyumlu Öğrenci Seçici   │  │ • Görsel Takım Kartları ve        │
│   (Arama + Tümü/Bekleyen/Tamamlanan)  │  │   Dokunmatik Üye Atama Çekmecesi  │
│ • Sabit Öğrenci Durum Başlığı         │  │ • 3 Aşamalı Grup Durum Çubuğu:    │
│   (Taslak X/Y veya Kesin Not)         │  │   [Puanlanıyor] ➔ [Tamamlandı]    │
│ • Otomatik Geçiş & Geri Dönüş Bandı   │  │   ➔ [Üyelere Uygulandı]           │
└───────────────────┬───────────────────┘  └───────────────┬───────────────────┘
                    │                                      │
                    └──────────────────┬───────────────────┘
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│             Ortak Dokunmatik Rubrik Kartı & Seviye Seçici Katmanı            │
│  • Açıklamalı Mod: Büyük Seviye Kutuları + Tam Seviye Açıklamaları           │
│  • Hızlı Mod: Kompakt Dokunmatik Puan Kutuları (Tek Ekranda Tüm Ölçütler)    │
│  • Ortak Kontroller: Hassas Tam Sayı Puan Girişi + Ölçüt Puanını Temizle     │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│          Mevcut Puanlama, Grup Uzlaştırma ve SHA-256 Kayıt Katmanı           │
│  • Son Eksik Ölçüt Tamamlama Algılayıcısı (!wasComplete && nowComplete)      │
│  • Grup-Üye Senkronizasyon Denetleyicisi & Geri Alma Geçmişi (undoHistory)   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Veri Modeli ve Durum Yönetimi

- **Veri Modeli Korunumu**: `EvaluationSession`, `StudentEvaluation`, `GroupEvaluation`, `StudentGroup` ve `Rubric` tiplerinde veya `storageLayer` şemasında hiçbir kırıcı değişiklik yapılmaz.
- **Birleşik Görünüm Durumu**:
  - `cardDensityMode: 'detailed' | 'compact'` — Bireysel ve grup değerlendirme ekranlarında paylaşılan **Açıklamalı / Hızlı** görünüm tercihi (Hızlı Değerlendirme modu seçildiğinde doğrudan `'compact'` görünümle açılır).
  - **Grup Senkronizasyon Durumu (`'in_progress' | 'completed_unapplied' | 'applied'`)**:
    - `'in_progress'`: Grup ölçütleri henüz tamamlanmadı (`completedCriteriaCount < totalCriteriaCount`). Kesin grup notu gösterilmez.
    - `'completed_unapplied'`: Grup ölçütlerinin tamamı puanlandı (`isComplete === true`), ancak gruptaki öğrencilerin en az birinde bu grup puanları henüz kayıtlı değil veya grup puanı son dağıtımdan sonra güncellendi.
    - `'applied'`: Grup değerlendirmesi tamamlandı ve gruptaki tüm üyelerin `groupCriterionScores` / `groupDirectScores` değerleri mevcut grup puanlarıyla birebir eşleşiyor.

### Etkileşimli Bileşen ve Durum Eşlemesi

1. **Ortak Seviye Seçimi ve Akıllı Otomatik Geçiş**:
   - Öğretmen ortak rubrik kartında bir seviyeye dokunduğunda, işlem öncesinde öğrencinin `wasComplete` durumu okunur.
   - Yeni puan kaydedildikten sonra `nowComplete` hesaplanır.
   - Yalnızca `!wasComplete && nowComplete && autoAdvanceStudent` koşulu sağlandığında sıradaki eksik öğrenciye geçilir ve `fastCompletionBanner` içine `previousStudentId` ve `previousStudentName` kaydedilerek **"← [Öğrenci Adı] Kaydına Geri Dön"** butonu gösterilir.
   - Zaten tamamlanmış bir öğrencinin puanı değiştirildiğinde (`wasComplete === true`) öğrenci geçişi yapılmaz.
2. **Grup Puanlama ve Üyelere Uygulama Akışı**:
   - Öğretmen grup rubrik kartlarını puanlarken durum **Puanlanıyor (`X/Y Ölçüt`)** olarak görünür.
   - Son eksik grup ölçütü puanlandığında grup durumu **Tamamlandı (Üyelere Uygulanmayı Bekliyor)** olur; grup başlığında **"Grup Puanını Üyelere Uygula"** ve **"Uygula ve Sıradaki Gruba Geç"** butonları belirir.
   - Öğretmen bu butona dokunduğunda grup puanları üyelere aktarılır (daha önce dağıtılmış puan varsa mevcut onay penceresi korunur) ve durum **Üyelere Uygulandı** rozetine dönüşür.
3. **Büyük Sınıf ve Dikey/Yatay Tablet Etkileşimi**:
   - Öğrenci listesinde arama kutusu ve *Tümü / Bekleyenler / Tamamlananlar* filtreleri büyük sınıflarda aranan öğrenciye anında ulaşmayı sağlar.
   - Dikey tablet görünümünde üstteki öğrenci/grup seçici çubuğundan **"Listeyi Aç"** düğmesiyle tam liste çekmecesi açılır veya **"Önceki / Sıradaki Bekleyen"** oklarıyla tek dokunuşla gezinilir.
