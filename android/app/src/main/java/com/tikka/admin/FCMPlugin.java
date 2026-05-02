package com.tikka.admin;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.RemoteMessage;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

@CapacitorPlugin(name = "FCMPlugin")
public class FCMPlugin extends Plugin {

    public static final String TAG = "FCMPlugin";
    public static final String CHANNEL_ID = "tnt_orders";
    public static final String CHANNEL_NAME = "Order Notifications";
    public static final String CHANNEL_DESC = "New order and delivery notifications";

    // JS-side listener callbacks stored by event name
    private final Map<String, Set<PluginCall>> listeners = new HashMap<>();

    @Override
    public void load() {
        super.load();
        FCMPluginHolder.set(this);
        try {
            createNotificationChannel();
        } catch (Exception e) {
            Log.e(TAG, "Failed to create notification channel: " + e.getMessage());
        }
        Log.d(TAG, "FCMPlugin loaded");
    }

    // ---- Called from JS bridge ----

    @PluginMethod
    public void getToken(PluginCall call) {
        try {
            FirebaseMessaging.getInstance().getToken()
                .addOnSuccessListener(token -> {
                    JSObject result = new JSObject();
                    result.put("token", token);
                    call.resolve(result);
                })
                .addOnFailureListener(e -> call.reject("Failed to get token: " + e.getMessage()));
        } catch (Exception e) {
            call.reject("getToken failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        JSObject result = new JSObject();
        result.put("receive", "granted");
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        JSObject result = new JSObject();
        result.put("receive", "granted");
        call.resolve(result);
    }

    @PluginMethod
    public void createChannel(PluginCall call) {
        try {
            createNotificationChannel();
            call.resolve();
        } catch (Exception e) {
            call.reject("createChannel failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void addListener(PluginCall call) {
        // Capacitor JS wrapper sends {eventName: string}, not {event: string}
        String eventName = call.getString("eventName");
        if (eventName == null) {
            eventName = call.getString("event");
        }
        if (eventName == null) {
            call.reject("event name required");
            return;
        }
        listeners.computeIfAbsent(eventName, k -> new java.util.HashSet<>()).add(call);
        call.resolve();
        Log.d(TAG, "JS listener registered for: " + eventName);
    }

    // ---- Public dispatch methods (called by FCMService) ----

    /** Dispatch a token refresh event to JS listeners. */
    public void dispatchTokenRefresh(String token) {
        JSObject data = new JSObject();
        data.put("token", token);
        dispatch("tokenReceived", data);
    }

    /** Dispatch a notification received event to JS listeners. */
    public void dispatchNotificationReceived(JSObject eventData) {
        dispatch("notificationReceived", eventData);
    }

    /** Called when a notification is tapped (from MainActivity). */
    public void dispatchNotificationTapped() {
        dispatch("notificationActionPerformed", new JSObject());
    }

    private void dispatch(String eventName, JSObject data) {
        Set<PluginCall> calls = listeners.get(eventName);
        if (calls == null || calls.isEmpty()) return;
        for (PluginCall call : calls) {
            call.resolve(data);
        }
    }

    // ---- Notification channel (Android 8+) ----

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager notificationManager =
                (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (notificationManager != null) {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription(CHANNEL_DESC);
                channel.enableVibration(true);
                channel.enableLights(true);
                channel.setSound(
                    Uri.parse("android.resource://" + getContext().getPackageName() + "/raw/tnt_alert"),
                    null);
                notificationManager.createNotificationChannel(channel);
                Log.d(TAG, "Notification channel created");
            }
        }
    }

    // ---- Show native notification ----

    public void showNotification(RemoteMessage remoteMessage) {
        Context ctx = getContext();
        if (ctx == null) return;

        String title = remoteMessage.getNotification() != null
            ? remoteMessage.getNotification().getTitle()
            : "New Order!";
        String body = remoteMessage.getNotification() != null
            ? remoteMessage.getNotification().getBody()
            : "New order received";

        Map<String, String> data = remoteMessage.getData();
        String orderId = data.get("orderId");
        String notifType = data.get("type");
        int notifId = (orderId != null
            ? orderId.hashCode()
            : (int)(System.currentTimeMillis() % Integer.MAX_VALUE));

        // Choose sound based on notification type from data payload
        String soundFile = "tnt_alert";
        if ("new_order".equals(notifType)) {
            soundFile = "new_order";
        }

        // Tap intent
        Intent intent = ctx.getPackageManager()
            .getLaunchIntentForPackage(ctx.getPackageName());
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        intent.putExtra("deep_link", "/staff");

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pendingIntent = PendingIntent.getActivity(ctx, notifId, intent, flags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(ctx.getApplicationInfo().icon)
            .setContentTitle(title != null ? title : "New Order!")
            .setContentText(body != null ? body : "New order received")
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setContentIntent(pendingIntent)
            .setSound(Uri.parse("android.resource://" + getContext().getPackageName() + "/raw/" + soundFile));

        NotificationManager notificationManager =
            (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager != null) {
            notificationManager.notify(notifId, builder.build());
            Log.d(TAG, "Notification shown: " + title + " / " + body);
        }

        // Forward to JS listeners
        JSObject eventData = new JSObject();
        JSObject notification = new JSObject();
        notification.put("title", title);
        notification.put("body", body);
        JSObject notificationData = new JSObject();
        for (Map.Entry<String, String> entry : data.entrySet()) {
            notificationData.put(entry.getKey(), entry.getValue());
        }
        notification.put("data", notificationData);
        eventData.put("notification", notification);

        dispatchNotificationReceived(eventData);
    }
}
