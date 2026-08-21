package dev.dih.client;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

public final class DihHudEditorScreen extends Screen {
    private final Screen parent;
    private String dragging;
    private double offsetX;
    private double offsetY;

    public DihHudEditorScreen(Screen parent) {
        super(Component.literal("Dih HUD Editor"));
        this.parent = parent;
    }

    @Override
    protected void init() {
        addRenderableWidget(Button.builder(Component.literal("Sıfırla"), b -> DihClient.CONFIG.resetPositions())
            .bounds(width / 2 - 105, height - 28, 100, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Bitti"), b -> onClose())
            .bounds(width / 2 + 5, height - 28, 100, 20).build());
    }

    @Override
    public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
        if (event.button() == 0) {
            for (DihHud.Bounds bounds : DihHud.bounds().values()) {
                if (bounds.contains(event.x(), event.y())) {
                    dragging = bounds.key();
                    offsetX = event.x() - bounds.x();
                    offsetY = event.y() - bounds.y();
                    return true;
                }
            }
        }
        return super.mouseClicked(event, doubleClick);
    }

    @Override
    public boolean mouseDragged(MouseButtonEvent event, double dragX, double dragY) {
        if (dragging != null) {
            int x = (int)Math.round(event.x() - offsetX);
            int y = (int)Math.round(event.y() - offsetY);
            DihClient.CONFIG.setPosition(dragging, Math.max(0, x), Math.max(0, y));
            return true;
        }
        return super.mouseDragged(event, dragX, dragY);
    }

    @Override
    public boolean mouseReleased(MouseButtonEvent event) {
        if (dragging != null) {
            dragging = null;
            DihClient.CONFIG.save();
            return true;
        }
        return super.mouseReleased(event);
    }

    @Override
    public void onClose() {
        DihClient.CONFIG.save();
        minecraft.setScreen(parent);
    }

    @Override
    public void render(GuiGraphics graphics, int mouseX, int mouseY, float delta) {
        renderBackground(graphics, mouseX, mouseY, delta);
        DihHud.renderEditorPreview(graphics);
        graphics.drawCenteredString(font, Component.literal("HUD öğelerini sürükle"), width / 2, 12, 0xFFFFFFFF);
        super.render(graphics, mouseX, mouseY, delta);
    }
}
