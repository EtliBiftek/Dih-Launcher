package dev.dih.client;

import com.mojang.blaze3d.platform.InputConstants;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.minecraft.client.CameraType;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.resources.Identifier;
import net.minecraft.util.Mth;

public final class DihClient implements ClientModInitializer {
    public static final String MOD_ID = "dih";
    public static DihConfig CONFIG;
    public static boolean sprintToggled;
    public static boolean zooming;
    public static KeyMapping ZOOM_KEY;
    public static KeyMapping MENU_KEY;
    public static KeyMapping BACKVIEW_KEY;
    public static KeyMapping PERSPECTIVE_KEY;

    private static Boolean vanillaToggleCrouch;
    private static CameraType savedCameraType;
    private static boolean backviewActive;
    private static boolean perspectiveActive;
    private static float perspectiveYaw;
    private static float perspectivePitch;
    private static Object lastLevel;
    private static long sessionStartedAt;

    @Override
    public void onInitializeClient() {
        CONFIG = DihConfig.load();
        KeyMapping.Category category = KeyMapping.Category.register(Identifier.fromNamespaceAndPath(MOD_ID, "main"));
        MENU_KEY = KeyBindingHelper.registerKeyBinding(new KeyMapping("key.dih.menu", InputConstants.Type.KEYSYM, InputConstants.KEY_RIGHT_SHIFT, category));
        ZOOM_KEY = KeyBindingHelper.registerKeyBinding(new KeyMapping("key.dih.zoom", InputConstants.Type.KEYSYM, InputConstants.KEY_C, category));
        BACKVIEW_KEY = KeyBindingHelper.registerKeyBinding(new KeyMapping("key.dih.backview", InputConstants.Type.KEYSYM, InputConstants.KEY_B, category));
        PERSPECTIVE_KEY = KeyBindingHelper.registerKeyBinding(new KeyMapping("key.dih.perspective", InputConstants.Type.KEYSYM, InputConstants.KEY_LALT, category));
        HudElementRegistry.addLast(Identifier.fromNamespaceAndPath(MOD_ID, "hud"), DihHud::render);
        ClientTickEvents.END_CLIENT_TICK.register(DihClient::tick);
    }

    private static void tick(Minecraft client) {
        if (CONFIG == null || !CONFIG.enabled) {
            restoreCamera(client);
            restoreToggleSneak(client);
            return;
        }

        while (MENU_KEY.consumeClick()) client.setScreen(new DihConfigScreen(client.screen));
        zooming = CONFIG.on("zoom") && ZOOM_KEY.isDown();
        trackSession(client);
        updateCameraModules(client);
        updateToggleSneak(client);

        if (client.player == null) return;
        if (CONFIG.on("toggleSprint") && client.options.keySprint.consumeClick()) sprintToggled = !sprintToggled;
        if (CONFIG.on("toggleSprint") && sprintToggled && client.options.keyUp.isDown() && !client.player.isCrouching()) client.player.setSprinting(true);

        if (CONFIG.on("timeChanger") && client.level != null) {
            client.level.setTimeFromServer(client.level.getGameTime(), CONFIG.timeOfDay, false);
        }
    }

    private static void trackSession(Minecraft client) {
        if (client.level != lastLevel) {
            lastLevel = client.level;
            sessionStartedAt = client.level == null ? 0L : System.currentTimeMillis();
        }
    }

    private static void updateToggleSneak(Minecraft client) {
        if (CONFIG.on("toggleSneak")) {
            if (vanillaToggleCrouch == null) vanillaToggleCrouch = client.options.toggleCrouch().get();
            if (!client.options.toggleCrouch().get()) client.options.toggleCrouch().set(true);
        } else restoreToggleSneak(client);
    }

    private static void restoreToggleSneak(Minecraft client) {
        if (vanillaToggleCrouch != null) {
            client.options.toggleCrouch().set(vanillaToggleCrouch);
            vanillaToggleCrouch = null;
        }
    }

    private static void updateCameraModules(Minecraft client) {
        boolean wantsBackview = CONFIG.on("backview") && BACKVIEW_KEY.isDown();
        boolean wantsPerspective = CONFIG.on("perspective") && PERSPECTIVE_KEY.isDown() && !wantsBackview;

        if (wantsBackview) {
            if (!backviewActive) {
                saveCamera(client);
                backviewActive = true;
            }
            if (perspectiveActive) endPerspective(client, false);
            client.options.setCameraType(CameraType.THIRD_PERSON_FRONT);
            return;
        }

        if (backviewActive) {
            backviewActive = false;
            restoreCamera(client);
        }

        if (wantsPerspective) {
            if (!perspectiveActive) {
                saveCamera(client);
                perspectiveActive = true;
                perspectiveYaw = 0F;
                perspectivePitch = 0F;
            }
            client.options.setCameraType(CameraType.THIRD_PERSON_BACK);
        } else if (perspectiveActive) endPerspective(client, true);
    }

    private static void saveCamera(Minecraft client) {
        if (savedCameraType == null) savedCameraType = client.options.getCameraType();
    }

    private static void endPerspective(Minecraft client, boolean restore) {
        perspectiveActive = false;
        perspectiveYaw = 0F;
        perspectivePitch = 0F;
        if (restore) restoreCamera(client);
    }

    private static void restoreCamera(Minecraft client) {
        backviewActive = false;
        perspectiveActive = false;
        perspectiveYaw = 0F;
        perspectivePitch = 0F;
        if (savedCameraType != null) {
            client.options.setCameraType(savedCameraType);
            savedCameraType = null;
        }
    }

    public static boolean perspectiveActive() { return perspectiveActive; }
    public static float perspectiveYaw() { return perspectiveYaw; }
    public static float perspectivePitch() { return perspectivePitch; }

    public static void turnPerspective(double yaw, double pitch) {
        if (!perspectiveActive) return;
        perspectiveYaw += (float)(yaw * 0.15D);
        perspectivePitch = Mth.clamp(perspectivePitch + (float)(pitch * 0.15D), -90F, 90F);
    }

    public static long sessionSeconds() {
        return sessionStartedAt == 0L ? 0L : Math.max(0L, (System.currentTimeMillis() - sessionStartedAt) / 1000L);
    }
}
