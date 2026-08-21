package dev.dih.client.mixin;

import dev.dih.client.DihClient;
import net.minecraft.client.renderer.entity.LivingEntityRenderer;
import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;
import net.minecraft.client.renderer.texture.OverlayTexture;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(LivingEntityRenderer.class)
public abstract class LivingEntityRendererMixin {
    @Inject(method = "getModelTint", at = @At("HEAD"), cancellable = true)
    private void dih$hitTint(LivingEntityRenderState state, CallbackInfoReturnable<Integer> cir) {
        if (DihClient.CONFIG != null && DihClient.CONFIG.on("hitColor") && state.hasRedOverlay) {
            cir.setReturnValue(DihClient.CONFIG.hitColor);
        }
    }

    @Inject(method = "getOverlayCoords", at = @At("HEAD"), cancellable = true)
    private static void dih$disableVanillaRed(LivingEntityRenderState state, float whiteOverlayProgress, CallbackInfoReturnable<Integer> cir) {
        if (DihClient.CONFIG != null && DihClient.CONFIG.on("hitColor") && state.hasRedOverlay) {
            cir.setReturnValue(OverlayTexture.NO_OVERLAY);
        }
    }
}
