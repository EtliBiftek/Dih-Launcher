package dev.dih.client.mixin;

import dev.dih.client.DihClient;
import net.minecraft.client.Camera;
import net.minecraft.client.renderer.GameRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(GameRenderer.class)
public abstract class GameRendererMixin {
    @Inject(method = "getFov", at = @At("RETURN"), cancellable = true)
    private void dih$zoom(Camera camera, float partialTick, boolean applyEffects, CallbackInfoReturnable<Float> cir) {
        if (DihClient.CONFIG != null && DihClient.zooming) cir.setReturnValue((float)(cir.getReturnValue() / Math.max(1.1, DihClient.CONFIG.zoomFactor)));
    }
}
