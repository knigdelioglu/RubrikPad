package com.knigdelioglu.rubrikpad;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Point;
import android.graphics.Rect;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

import java.util.List;

/**
 * 100% On-Device Google ML Kit Text Recognition v2 (Latin + Turkish) Capacitor Plugin.
 * Processes images locally in memory (KVKK compliant, zero network calls) and returns
 * hierarchical Blocks -> Lines -> Elements (words) -> Symbols with exact bounding boxes,
 * 4 corner points, angle/skew, and confidence scores.
 */
@CapacitorPlugin(name = "MlKitTextRecognition")
public class MlKitTextRecognitionPlugin extends Plugin {

    private static final int MAX_BASE64_LENGTH = 20 * 1024 * 1024; // ~15 MB raw image cap
    private static final int MAX_BITMAP_DIMENSION_PX = 3200;

    private TextRecognizer recognizer;

    @Override
    public void load() {
        super.load();
        recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
    }

    @PluginMethod
    public void getCapabilities(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", true);
        ret.put("engineId", "google-mlkit-text-recognition-v2-latin");
        ret.put("engineName", "Google ML Kit Text Recognition v2 (Android Yerel / Cihaz İçi)");
        ret.put("isLocalOnly", true);
        ret.put("script", "latin-turkish");
        call.resolve(ret);
    }

    @PluginMethod
    public void recognizeText(PluginCall call) {
        String base64Image = call.getString("base64Image");
        Integer rotationDegrees = call.getInt("rotationDegrees", 0);

        if (base64Image == null || base64Image.trim().isEmpty()) {
            call.reject("base64Image parametresi gereklidir.");
            return;
        }

        if (base64Image.length() > MAX_BASE64_LENGTH) {
            call.reject("Görsel verisi güvenli bellek sınırını (15 MB) aşıyor.");
            return;
        }

        Bitmap bitmap = null;
        try {
            String cleanBase64 = base64Image;
            int commaIdx = cleanBase64.indexOf(',');
            if (commaIdx != -1) {
                cleanBase64 = cleanBase64.substring(commaIdx + 1);
            }

            byte[] decodedBytes = Base64.decode(cleanBase64, Base64.DEFAULT);

            // Pass 1: Decode image bounds without allocating pixel memory
            BitmapFactory.Options boundsOpts = new BitmapFactory.Options();
            boundsOpts.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.length, boundsOpts);

            final int origWidth = boundsOpts.outWidth;
            final int origHeight = boundsOpts.outHeight;
            if (origWidth <= 0 || origHeight <= 0) {
                call.reject("Görsel bayt dizisi geçerli bir görüntü olarak çözümlenemedi.");
                return;
            }

            int sampleSize = 1;
            while ((origWidth / sampleSize) > MAX_BITMAP_DIMENSION_PX
                    || (origHeight / sampleSize) > MAX_BITMAP_DIMENSION_PX) {
                sampleSize *= 2;
            }

            // Pass 2: Decode bounded Bitmap
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
            opts.inScaled = false;
            opts.inSampleSize = sampleSize;

            bitmap = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.length, opts);
            if (bitmap == null) {
                call.reject("Görsel bayt dizisi Bitmap olarak çözümlenemedi.");
                return;
            }

            final Bitmap finalBitmap = bitmap;
            final int imageWidth = finalBitmap.getWidth();
            final int imageHeight = finalBitmap.getHeight();
            final int safeRotation = (rotationDegrees != null && (rotationDegrees == 90 || rotationDegrees == 180 || rotationDegrees == 270))
                    ? rotationDegrees
                    : 0;

            if (recognizer == null) {
                recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
            }

            InputImage inputImage = InputImage.fromBitmap(finalBitmap, safeRotation);
            final long startNs = System.nanoTime();

            recognizer.process(inputImage)
                    .addOnSuccessListener(visionText -> {
                        try {
                            double elapsedMs = (System.nanoTime() - startNs) / 1_000_000.0;
                            JSObject response = serializeVisionText(visionText, imageWidth, imageHeight, elapsedMs);
                            if (!finalBitmap.isRecycled()) {
                                finalBitmap.recycle();
                            }
                            call.resolve(response);
                        } catch (OutOfMemoryError oom) {
                            if (!finalBitmap.isRecycled()) {
                                finalBitmap.recycle();
                            }
                            System.gc();
                            call.reject("Cihaz belleği (RAM) yetersiz kaldı. Lütfen daha düşük çözünürlüklü bir fotoğraf deneyin.");
                        }
                    })
                    .addOnFailureListener(e -> {
                        if (!finalBitmap.isRecycled()) {
                            finalBitmap.recycle();
                        }
                        call.reject("ML Kit yerel metin tanıma hatası: " + e.getMessage(), e);
                    });

        } catch (OutOfMemoryError oom) {
            if (bitmap != null && !bitmap.isRecycled()) {
                bitmap.recycle();
            }
            System.gc();
            call.reject("Görsel işlenirken cihaz belleği (OutOfMemoryError) sınırına ulaşıldı. Lütfen daha küçük bir görsel seçin.");
        } catch (Exception ex) {
            if (bitmap != null && !bitmap.isRecycled()) {
                bitmap.recycle();
            }
            call.reject("ML Kit görüntü işleme hatası: " + ex.getMessage(), ex);
        }
    }

    private JSObject serializeVisionText(Text visionText, int imageWidth, int imageHeight, double elapsedMs) {
        JSObject root = new JSObject();
        root.put("text", visionText.getText());
        root.put("imageWidth", imageWidth);
        root.put("imageHeight", imageHeight);
        root.put("elapsedMs", Math.round(elapsedMs * 100.0) / 100.0);
        root.put("isLocalOnly", true);

        JSArray blocksArray = new JSArray();
        List<Text.TextBlock> blocks = visionText.getTextBlocks();

        for (int bIdx = 0; bIdx < blocks.size(); bIdx++) {
            Text.TextBlock block = blocks.get(bIdx);
            JSObject blockObj = new JSObject();
            blockObj.put("blockIndex", bIdx);
            blockObj.put("text", block.getText());
            blockObj.put("recognizedLanguage", block.getRecognizedLanguage());
            blockObj.put("bbox", serializeRect(block.getBoundingBox()));
            blockObj.put("cornerPoints", serializePoints(block.getCornerPoints()));

            JSArray linesArray = new JSArray();
            List<Text.Line> lines = block.getLines();
            for (int lIdx = 0; lIdx < lines.size(); lIdx++) {
                Text.Line line = lines.get(lIdx);
                JSObject lineObj = new JSObject();
                lineObj.put("lineIndex", lIdx);
                lineObj.put("text", line.getText());
                lineObj.put("confidence", Math.round(line.getConfidence() * 1000.0) / 10.0);
                lineObj.put("angle", Math.round(line.getAngle() * 100.0) / 100.0);
                lineObj.put("recognizedLanguage", line.getRecognizedLanguage());
                lineObj.put("bbox", serializeRect(line.getBoundingBox()));
                lineObj.put("cornerPoints", serializePoints(line.getCornerPoints()));

                JSArray elementsArray = new JSArray();
                List<Text.Element> elements = line.getElements();
                for (int eIdx = 0; eIdx < elements.size(); eIdx++) {
                    Text.Element element = elements.get(eIdx);
                    JSObject elemObj = new JSObject();
                    elemObj.put("elementIndex", eIdx);
                    elemObj.put("text", element.getText());
                    elemObj.put("confidence", Math.round(element.getConfidence() * 1000.0) / 10.0);
                    elemObj.put("angle", Math.round(element.getAngle() * 100.0) / 100.0);
                    elemObj.put("recognizedLanguage", element.getRecognizedLanguage());
                    elemObj.put("bbox", serializeRect(element.getBoundingBox()));
                    elemObj.put("cornerPoints", serializePoints(element.getCornerPoints()));

                    JSArray symbolsArray = new JSArray();
                    List<Text.Symbol> symbols = element.getSymbols();
                    for (int sIdx = 0; sIdx < symbols.size(); sIdx++) {
                        Text.Symbol symbol = symbols.get(sIdx);
                        JSObject symObj = new JSObject();
                        symObj.put("symbolIndex", sIdx);
                        symObj.put("text", symbol.getText());
                        symObj.put("confidence", Math.round(symbol.getConfidence() * 1000.0) / 10.0);
                        symObj.put("angle", Math.round(symbol.getAngle() * 100.0) / 100.0);
                        symObj.put("bbox", serializeRect(symbol.getBoundingBox()));
                        symbolsArray.put(symObj);
                    }
                    elemObj.put("symbols", symbolsArray);
                    elementsArray.put(elemObj);
                }
                lineObj.put("elements", elementsArray);
                linesArray.put(lineObj);
            }
            blockObj.put("lines", linesArray);
            blocksArray.put(blockObj);
        }

        root.put("blocks", blocksArray);
        return root;
    }

    private JSObject serializeRect(Rect rect) {
        JSObject obj = new JSObject();
        if (rect == null) {
            obj.put("x0", 0);
            obj.put("y0", 0);
            obj.put("x1", 0);
            obj.put("y1", 0);
            return obj;
        }
        obj.put("x0", rect.left);
        obj.put("y0", rect.top);
        obj.put("x1", rect.right);
        obj.put("y1", rect.bottom);
        return obj;
    }

    private JSArray serializePoints(Point[] points) {
        JSArray arr = new JSArray();
        if (points == null) return arr;
        for (Point pt : points) {
            if (pt != null) {
                JSObject pObj = new JSObject();
                pObj.put("x", pt.x);
                pObj.put("y", pt.y);
                arr.put(pObj);
            }
        }
        return arr;
    }

    @Override
    protected void handleOnDestroy() {
        if (recognizer != null) {
            recognizer.close();
            recognizer = null;
        }
        super.handleOnDestroy();
    }
}
