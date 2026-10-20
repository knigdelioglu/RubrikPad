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

        try {
            String cleanBase64 = base64Image;
            int commaIdx = cleanBase64.indexOf(',');
            if (commaIdx != -1) {
                cleanBase64 = cleanBase64.substring(commaIdx + 1);
            }

            byte[] decodedBytes = Base64.decode(cleanBase64, Base64.DEFAULT);
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
            opts.inScaled = false;

            Bitmap bitmap = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.length, opts);
            if (bitmap == null) {
                call.reject("Görsel बा이트 dizisi Bitmap olarak çözümlenemedi.");
                return;
            }

            final int imageWidth = bitmap.getWidth();
            final int imageHeight = bitmap.getHeight();
            final int safeRotation = (rotationDegrees != null && (rotationDegrees == 90 || rotationDegrees == 180 || rotationDegrees == 270))
                    ? rotationDegrees
                    : 0;

            if (recognizer == null) {
                recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
            }

            InputImage inputImage = InputImage.fromBitmap(bitmap, safeRotation);
            final long startNs = System.nanoTime();

            recognizer.process(inputImage)
                    .addOnSuccessListener(visionText -> {
                        double elapsedMs = (System.nanoTime() - startNs) / 1_000_000.0;
                        JSObject response = serializeVisionText(visionText, imageWidth, imageHeight, elapsedMs);
                        bitmap.recycle();
                        call.resolve(response);
                    })
                    .addOnFailureListener(e -> {
                        bitmap.recycle();
                        call.reject("ML Kit yerel metin tanıma hatası: " + e.getMessage(), e);
                    });

        } catch (Exception ex) {
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
