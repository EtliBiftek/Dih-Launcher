package dev.dih.client.mixin;

import dev.dih.client.DihClient;
import net.minecraft.client.Camera;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyArgs;
import org.spongepowered.asm.mixin.injection.invoke.arg.Args;

@Mixin(Camera.class)
public abstract class CameraMixin {
    @ModifyArgs(method = "setup", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/Camera;setRotation(FF)V", ordinal = 0))
    private void dih$perspectiveRotation(Args args) {
        if (!DihClient.perspectiveActive()) return;
        float yaw = args.get(0);
        float pitch = args.get(1);
        args.set(0, yaw + DihClient.perspectiveYaw());
        args.set(1, Math.max(-90F, Math.min(90F, pitch + DihClient.perspectivePitch())));
    }
}
