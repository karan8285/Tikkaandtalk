package com.tikka.admin;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Log;
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

import java.io.File;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;

/**
 * CameraPlugin — launches native camera via ACTION_IMAGE_CAPTURE intent.
 *
 * Why not use <input capture="environment"> via BridgeWebChromeClient?
 * Because on Android 14+ (API 34+), ACTION_IMAGE_CAPTURE may not resolve
 * on all devices, causing silent fallback to file picker.
 *
 * This plugin directly launches the camera and returns the captured photo URI
 * to JS via a callback pattern.
 */
@CapacitorPlugin(name = "Camera")
public class CameraPlugin extends Plugin {

    public static final String TAG = "CameraPlugin";

    private ActivityResultLauncher<String[]> permissionLauncher;
    private ActivityResultLauncher<Intent> cameraLauncher;
    private PluginCall pendingCall;
    private Uri capturedImageUri;

    @Override
    public void load() {
        super.load();
        Log.d(TAG, "CameraPlugin loaded");

        AppCompatActivity activity = getActivity();
        if (activity == null) return;

        // Register for camera permission result
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

        // Register for camera intent result
        cameraLauncher = bridge.registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            (ActivityResult result) -> {
                if (pendingCall == null) return;

                if (result.getResultCode() == Activity.RESULT_OK && capturedImageUri != null) {
                    JSObject ret = new JSObject();
                    ret.put("uri", capturedImageUri.toString());
                    pendingCall.resolve(ret);
                    Log.d(TAG, "Camera captured: " + capturedImageUri);
                } else {
                    pendingCall.reject("CAPTURE_CANCELLED", "User cancelled or camera failed");
                    Log.d(TAG, "Camera cancelled or failed");
                }
                pendingCall = null;
                capturedImageUri = null;
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

        // Create temp file for camera output
        File imageFile;
        try {
            imageFile = createImageFile();
            capturedImageUri = FileProvider.getUriForFile(
                activity,
                activity.getPackageName() + ".fileprovider",
                imageFile
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

        lastCapturedFilePath = imageFile.getAbsolutePath();
        cameraLauncher.launch(takePictureIntent);
    }

    private File createImageFile() throws IOException {
        AppCompatActivity activity = getActivity();
        if (activity == null) throw new IOException("No activity");

        String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", java.util.Locale.US).format(new Date());
        String imageFileName = "CAMERA_" + timeStamp + ".jpg";
        File storageDir = activity.getExternalFilesDir(Environment.DIRECTORY_PICTURES);
        if (storageDir == null) throw new IOException("Cannot access pictures directory");
        return File.createTempFile(imageFileName, ".jpg", storageDir);
    }

    private String lastCapturedFilePath;
}