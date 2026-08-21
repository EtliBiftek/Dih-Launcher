package dev.dih.client.mixin;

import com.llamalad7.mixinextras.injector.ModifyExpressionValue;
import dev.dih.client.DihClient;
import net.minecraft.client.renderer.LightTexture;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

@Mixin(LightTexture.class)
public abstract class LightTextureMixin {
    @ModifyExpressionValue(
        method = "updateLightTexture(F)V",
        at = @At(
            value = "INVOKE",
            target = "Ljava/lang/Double;floatValue()F",
            ordinal = 1
        )
    )
    private float dih$fullbrightGamma(float original) {
        if (DihClient.CONFIG != null && DihClient.CONFIG.on("fullbright")) return 15.0F;
        return original;
    }
}
