package dev.dih.client;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

import java.util.List;

public final class DihConfigScreen extends Screen {
    private final Screen parent;
    private static final List<String> KEYS = List.of(
            "keystrokes","cps","fps","ping","armorHud","potionHud","toggleSprint","toggleSneak",
            "zoom","backview","perspective","reachDisplay","tntTime","timer","timeChanger",
            "fullbright","lowFire","crosshair","hitColor"
    );

    public DihConfigScreen(Screen parent) { super(Component.literal("Dih Client")); this.parent = parent; }

    @Override
    protected void init() {
        int columns = width >= 700 ? 3 : 2;
        int buttonW = columns == 3 ? 190 : 200;
        int gap = 8;
        int totalW = columns * buttonW + (columns - 1) * gap;
        int left = width / 2 - totalW / 2;
        int startY = 42;
        for (int i = 0; i < KEYS.size(); i++) {
            String key = KEYS.get(i);
            int col = i % columns;
            int row = i / columns;
            addRenderableWidget(Button.builder(label(key), b -> {
                DihClient.CONFIG.toggle(key);
                b.setMessage(label(key));
            }).bounds(left + col * (buttonW + gap), startY + row * 24, buttonW, 20).build());
        }
        int actionY = startY + ((KEYS.size() + columns - 1) / columns) * 24 + 8;
        addRenderableWidget(Button.builder(Component.literal("HUD Düzenle"), b -> minecraft.setScreen(new DihHudEditorScreen(this))).bounds(width / 2 - 205, actionY, 200, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Kapat"), b -> onClose()).bounds(width / 2 + 5, actionY, 200, 20).build());
    }

    private Component label(String key) { return Component.literal(pretty(key) + ": " + (DihClient.CONFIG.on(key) ? "ON" : "OFF")); }
    private String pretty(String key) { return switch (key) {
        case "armorHud" -> "Armor HUD";
        case "potionHud" -> "Potion HUD";
        case "toggleSprint" -> "Toggle Sprint";
        case "toggleSneak" -> "Toggle Sneak";
        case "reachDisplay" -> "Reach Display";
        case "tntTime" -> "TNT Time";
        case "timeChanger" -> "Time Changer";
        case "fullbright" -> "Fullbright";
        case "lowFire" -> "Low Fire";
        case "hitColor" -> "Hit Color";
        case "backview" -> "Backview";
        case "perspective" -> "Perspective";
        default -> Character.toUpperCase(key.charAt(0)) + key.substring(1);
    }; }

    @Override public void onClose() { minecraft.setScreen(parent); }
    @Override public void render(GuiGraphics graphics, int mouseX, int mouseY, float delta) {
        renderBackground(graphics, mouseX, mouseY, delta);
        graphics.drawCenteredString(font, title, width / 2, 18, 0xFFFFFFFF);
        super.render(graphics, mouseX, mouseY, delta);
    }
}
