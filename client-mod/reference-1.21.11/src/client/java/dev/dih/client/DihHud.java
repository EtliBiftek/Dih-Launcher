package dev.dih.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.item.PrimedTnt;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.EntityHitResult;
import org.joml.Matrix3x2fStack;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class DihHud {
    public record Bounds(String key, int x, int y, int width, int height) {
        public boolean contains(double mx, double my) { return mx >= x && my >= y && mx <= x + width && my <= y + height; }
    }

    private static final Map<String, Bounds> BOUNDS = new LinkedHashMap<>();
    private static final EquipmentSlot[] ARMOR_SLOTS = {
            EquipmentSlot.FEET, EquipmentSlot.LEGS, EquipmentSlot.CHEST, EquipmentSlot.HEAD
    };
    private DihHud() {}

    public static Map<String, Bounds> bounds() { return new LinkedHashMap<>(BOUNDS); }

    public static void render(GuiGraphics g, net.minecraft.client.DeltaTracker deltaTracker) {
        Minecraft mc = Minecraft.getInstance();
        if (DihClient.CONFIG == null || !DihClient.CONFIG.enabled || mc.options.hideGui || mc.screen instanceof DihHudEditorScreen) return;
        renderWidgets(g, mc, false);
    }

    public static void renderEditorPreview(GuiGraphics g) {
        Minecraft mc = Minecraft.getInstance();
        if (DihClient.CONFIG == null) return;
        renderWidgets(g, mc, true);
        for (Bounds b : BOUNDS.values()) {
            g.renderOutline(b.x(), b.y(), b.width(), b.height(), 0xFF8B5CF6);
            g.drawString(mc.font, b.key(), b.x() + 3, b.y() - 10, 0xFFC4B5FD, true);
        }
    }

    private static void renderWidgets(GuiGraphics g, Minecraft mc, boolean editor) {
        BOUNDS.clear();
        int sw = mc.getWindow().getGuiScaledWidth();
        int sh = mc.getWindow().getGuiScaledHeight();

        if (editor || DihClient.CONFIG.on("fps")) widget(g, "fps", 7, 7, 72, 15, () -> text(g, 0, 0, "FPS: " + mc.getFps()));
        if (editor || DihClient.CONFIG.on("ping")) widget(g, "ping", 7, 25, 84, 15, () -> text(g, 0, 0, "Ping: " + ping(mc) + " ms"));
        if (editor || DihClient.CONFIG.on("cps")) widget(g, "cps", 7, 43, 94, 15, () -> text(g, 0, 0, "CPS: " + CpsTracker.left() + " | " + CpsTracker.right()));
        if (editor || DihClient.CONFIG.on("toggleSprint")) widget(g, "toggleSprint", 7, 61, 100, 15, () -> text(g, 0, 0, "Sprint: " + (DihClient.sprintToggled ? "Toggled" : "Vanilla")));
        if (editor || DihClient.CONFIG.on("reachDisplay")) widget(g, "reachDisplay", 7, 79, 100, 15, () -> text(g, 0, 0, "Reach: " + reach(mc)));
        if (editor || DihClient.CONFIG.on("tntTime")) widget(g, "tntTime", 7, 97, 112, 15, () -> text(g, 0, 0, tntTime(mc)));
        if (editor || DihClient.CONFIG.on("timer")) widget(g, "timer", 7, 115, 104, 15, () -> text(g, 0, 0, "Timer: " + timer()));
        if (editor || DihClient.CONFIG.on("keystrokes")) widget(g, "keystrokes", 7, 138, 60, 60, () -> renderKeys(g, 0, 0, mc));
        if (editor || DihClient.CONFIG.on("armorHud")) widget(g, "armorHud", 7, sh - 48, 92, 42, () -> renderArmor(g, 0, 0, mc));
        int effectsHeight = Math.max(18, Math.min(150, Math.max(1, mc.player == null ? 1 : mc.player.getActiveEffects().size()) * 15));
        if (editor || DihClient.CONFIG.on("potionHud")) widget(g, "potionHud", sw - 145, 7, 138, effectsHeight, () -> renderEffects(g, 0, 0, mc));
        if (!editor && DihClient.CONFIG.on("crosshair")) renderCrosshair(g, mc);
    }

    private static void widget(GuiGraphics g, String key, int defaultX, int defaultY, int width, int height, Runnable draw) {
        DihConfig.HudPosition p = DihClient.CONFIG.position(key, defaultX, defaultY);
        float scale = (float)Math.max(0.5, Math.min(2.0, DihClient.CONFIG.scale));
        int bw = Math.max(1, Math.round(width * scale));
        int bh = Math.max(1, Math.round(height * scale));
        BOUNDS.put(key, new Bounds(key, p.x(), p.y(), bw, bh));
        Matrix3x2fStack matrices = g.pose();
        matrices.pushMatrix();
        matrices.translate(p.x(), p.y());
        matrices.scale(scale, scale);
        draw.run();
        matrices.popMatrix();
    }

    private static void text(GuiGraphics g, int x, int y, String s) {
        Minecraft mc = Minecraft.getInstance();
        int w = mc.font.width(s) + 8;
        g.fill(x, y, x + w, y + 13, 0x88000000);
        g.drawString(mc.font, s, x + 4, y + 2, 0xFFFFFFFF, true);
    }

    private static void renderKeys(GuiGraphics g, int x, int y, Minecraft mc) {
        key(g, x + 21, y, "W", mc.options.keyUp.isDown(), 18);
        key(g, x, y + 20, "A", mc.options.keyLeft.isDown(), 18);
        key(g, x + 21, y + 20, "S", mc.options.keyDown.isDown(), 18);
        key(g, x + 42, y + 20, "D", mc.options.keyRight.isDown(), 18);
        key(g, x, y + 42, "L " + CpsTracker.left(), mc.mouseHandler.isLeftPressed(), 29);
        key(g, x + 31, y + 42, "R " + CpsTracker.right(), mc.mouseHandler.isRightPressed(), 29);
    }

    private static void key(GuiGraphics g, int x, int y, String s, boolean down, int w) {
        Minecraft mc = Minecraft.getInstance();
        g.fill(x, y, x + w, y + 18, down ? 0xCC8B5CF6 : 0x99000000);
        g.drawCenteredString(mc.font, s, x + w / 2, y + 5, 0xFFFFFFFF);
    }

    private static void renderArmor(GuiGraphics g, int x, int y, Minecraft mc) {
        if (mc.player == null) return;
        int i = 0;
        for (EquipmentSlot slot : ARMOR_SLOTS) {
            ItemStack stack = mc.player.getItemBySlot(slot);
            if (stack.isEmpty()) continue;
            g.renderItem(stack, x + i * 22, y);
            if (stack.isDamageableItem()) {
                String durability = String.valueOf(stack.getMaxDamage() - stack.getDamageValue());
                g.drawString(mc.font, durability, x + i * 22, y + 19, 0xFFFFFFFF, true);
            }
            i++;
        }
    }

    private static void renderEffects(GuiGraphics g, int x, int y, Minecraft mc) {
        if (mc.player == null) { text(g, x, y, "No effects"); return; }
        List<MobEffectInstance> list = new ArrayList<>(mc.player.getActiveEffects());
        if (list.isEmpty()) { text(g, x, y, "No effects"); return; }
        for (MobEffectInstance e : list) {
            int sec = Math.max(0, e.getDuration() / 20);
            String s = e.getEffect().value().getDisplayName().getString() + " " + (sec / 60) + ":" + String.format("%02d", sec % 60);
            text(g, x, y, s);
            y += 15;
        }
    }

    private static String reach(Minecraft mc) {
        if (mc.player == null || !(mc.hitResult instanceof EntityHitResult hit)) return "--";
        float d = mc.player.distanceTo(hit.getEntity());
        return String.format(java.util.Locale.ROOT, "%.2f", d);
    }

    private static String tntTime(Minecraft mc) {
        if (mc.player == null || mc.level == null) return "TNT: --";
        PrimedTnt nearest = null;
        float nearestDistance = Float.MAX_VALUE;
        for (Entity entity : mc.level.entitiesForRendering()) {
            if (!(entity instanceof PrimedTnt tnt)) continue;
            float d = mc.player.distanceTo(tnt);
            if (d < nearestDistance) { nearest = tnt; nearestDistance = d; }
        }
        if (nearest == null) return "TNT: --";
        return String.format(java.util.Locale.ROOT, "TNT: %.2fs (%.1fm)", nearest.getFuse() / 20.0F, nearestDistance);
    }

    private static String timer() {
        long sec = DihClient.sessionSeconds();
        long h = sec / 3600L;
        long m = (sec % 3600L) / 60L;
        long s = sec % 60L;
        return h > 0 ? String.format(java.util.Locale.ROOT, "%d:%02d:%02d", h, m, s) : String.format(java.util.Locale.ROOT, "%02d:%02d", m, s);
    }

    private static int ping(Minecraft mc) {
        if (mc.player == null || mc.getConnection() == null) return 0;
        PlayerInfo info = mc.getConnection().getPlayerInfo(mc.player.getUUID());
        return info == null ? 0 : info.getLatency();
    }

    private static void renderCrosshair(GuiGraphics g, Minecraft mc) {
        int cx = mc.getWindow().getGuiScaledWidth() / 2;
        int cy = mc.getWindow().getGuiScaledHeight() / 2;
        g.fill(cx - 5, cy, cx + 6, cy + 1, 0xFFFFFFFF);
        g.fill(cx, cy - 5, cx + 1, cy + 6, 0xFFFFFFFF);
    }
}
