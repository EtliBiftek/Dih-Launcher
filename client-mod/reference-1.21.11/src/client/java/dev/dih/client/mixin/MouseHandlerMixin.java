package dev.dih.client.mixin;

import com.mojang.blaze3d.platform.InputConstants;
import dev.dih.client.CpsTracker;
import dev.dih.client.DihClient;
import net.minecraft.client.MouseHandler;
import net.minecraft.client.input.MouseButtonInfo;
import net.minecraft.client.player.LocalPlayer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.Redirect;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(MouseHandler.class)
public abstract class MouseHandlerMixin {
    @Inject(method = "onButton", at = @At("HEAD"))
    private void dih$trackCps(long window, MouseButtonInfo info, int action, CallbackInfo ci) {
        if (action == InputConstants.PRESS && DihClient.CONFIG != null && DihClient.CONFIG.enabled && DihClient.CONFIG.on("cps")) {
            int button = info.button();
            if (button == 0 || button == 1) CpsTracker.click(button);
        }
    }

    @Redirect(method = "turnPlayer", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/player/LocalPlayer;turn(DD)V"))
    private void dih$perspectiveTurn(LocalPlayer player, double yaw, double pitch) {
        if (DihClient.perspectiveActive()) DihClient.turnPerspective(yaw, pitch);
        else player.turn(yaw, pitch);
    }
}
