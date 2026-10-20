package com.knigdelioglu.rubrikpad;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MlKitTextRecognitionPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
