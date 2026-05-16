package com.tikka.admin;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.provider.MediaStore;
import android.util.Log;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;

/**
 * CameraPlugin — launches native camera via ACTION_IMAGE_CAPTURE intent.
 * Returns image as base64 so WebView can access it without file:// restrictions.
 */
@CapacitorPlugin(name = "Camera")
public class CameraPlugin extends Plugin {

    public static final String TAG = "CameraPlugin";

    private ActivityResultLauncher<String[]> permissionLauncher;
    private ActivityResultLauncher<Intent> cameraLauncher;
    private PluginCall pendingCall;
    private Uri capturedImageUri;
    private File lastCapturedFile;

    @Override
    public void load() {
        super.load();
        Log.d(TAG, "CameraPlugin loaded");

        AppCompatActivity activity = getActivity();
        if (activity == null) return;

        permissionLauncher = bridge.registerForActivityResult(
            new ActivityResultContracts.RequestMultiplePermissions(),
            (java.util.Map<String, Boolean> result) -> {
                boolean granted = true;
                for (Boolean b : result.values()) {
                    if (!b) { granted = false; break; }
                }
                if (granted) {
                    launchCamera();
                } else {
                    if (pendingCall != null) {
                        pendingCall.reject("PERMISSION_DENIED", "Camera permission denied");
                        pendingCall = null;
                    }
                }
            }
        );

        cameraLauncher = bridge.registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            (ActivityResult result) -> {
                if (pendingCall == null) return;

                if (result.getResultCode() == Activity.RESULT_OK && lastCapturedFile != null && lastCapturedFile.exists()) {
                    try {
                        Bitmap bitmap = BitmapFactory.decodeFile(lastCapturedFile.getAbsolutePath());
                        if (bitmap == null) {
                            pendingCall.reject("FILE_ERROR", "Could not decode captured image");
                            pendingCall = null;
                            return;
                        }

                        ByteArrayOutputStream baos = new ByteArrayOutputStream();
                        bitmap.compress(Bitmap.CompressFormat.JPEG, 85, baos);
                        byte[] imageBytes = baos.toByteArray();
                        String base64 = Base64.encodeToString(imageBytes, Base64.NO_WRAP);

                        JSObject ret = new JSObject();
                        ret.put("base64", "data:image/jpeg;base64," + base64);
                        ret.put("path", lastCapturedFile.getAbsolutePath());
                        pendingCall.resolve(ret);
                        Log.d(TAG, "Camera captured, returning base64 (" + imageBytes.length + " bytes)");
                    } catch (Exception e) {
                        Log.e(TAG, "Error encoding image: " + e.getMessage());
                        pendingCall.reject("FILE_ERROR", "Could not encode captured image: " + e.getMessage());
                    }
                } else {
                    pendingCall.reject("CAPTURE_CANCELLED", "User cancelled or camera failed");
                    Log.d(TAG, "Camera cancelled or failed");
                }
                pendingCall = null;
                lastCapturedFile = null;
            }
        );
    }

    @PluginMethod
    public void hasPermission(PluginCall call) {
        boolean granted = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.CAMERA)
            == android.content.pm.PackageManager.PERMISSION_GRANTED;
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermissionAndCapture(PluginCall call) {
        AppCompatActivity activity = getActivity();
        if (activity == null) {
            call.reject("ACTIVITY_NOT_AVAILABLE");
            return;
        }

        pendingCall = call;

        boolean hasPermission = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.CAMERA)
            == android.content.pm.PackageManager.PERMISSION_GRANTED;

        if (hasPermission) {
            launchCamera();
        } else {
            permissionLauncher.launch(new String[]{Manifest.permission.CAMERA});
        }
    }

    @SuppressLint("QueryPermissionsNeeded")
    private void launchCamera() {
        AppCompatActivity activity = getActivity();
        if (activity == null) {
            if (pendingCall != null) {
                pendingCall.reject("ACTIVITY_NOT_AVAILABLE");
                pendingCall = null;
            }
            return;
        }

        try {
            lastCapturedFile = createImageFile();
            capturedImageUri = FileProvider.getUriForFile(
                activity,
                activity.getPackageName() + ".fileprovider",
                lastCapturedFile
            );
        } catch (IOException e) {
            Log.e(TAG, "Failed to create image file: " + e.getMessage());
            if (pendingCall != null) {
                pendingCall.reject("FILE_ERROR", "Could not create image file: " + e.getMessage());
                pendingCall = null;
            }
            return;
        }

        Intent takePictureIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        takePictureIntent.putExtra(MediaStore.EXTRA_OUTPUT, capturedImageUri);

        if (takePictureIntent.resolveActivity(activity.getPackageManager()) == null) {
            Log.e(TAG, "No camera app found to handle ACTION_IMAGE_CAPTURE");
            if (pendingCall != null) {
                pendingCall.reject("NO_CAMERA_APP", "No camera app available on this device");
                pendingCall = null;
            }
            return;
        }

        cameraLauncher.launch(takePictureIntent);
    }

    private File createImageFile() throws IOException {
        AppCompatActivity activity = getActivity();
        if (activity == null) throw new IOException("No activity");

        String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", java.util.Locale.US).format(new Date());
        String imageFileName = "CAMERA_" + timeStamp + ".jpg";
        File cacheDir = activity.getCacheDir();
        if (cacheDir == null) throw new IOException("Cannot access cache directory");
        return File.createTempFile(imageFileName, ".jpg", cacheDir);
    }
}