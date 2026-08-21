package dev.dih.client;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

public final class DihConfig {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("dih-client.json");

    public int schema = 1;
    public boolean launcherManaged = true;
    public boolean enabled = true;
    public double scale = 1.0;
    public Map<String, Boolean> modules = defaults();
    public Map<String, HudPosition> positions = new LinkedHashMap<>();
    public int hitColor = 0xFFFF5555;
    public double lowFireOffset = 0.45;
    public double zoomFactor = 4.0;
    public int timeOfDay = 6000;

    public static Map<String, Boolean> defaults() {
        Map<String, Boolean> map = new LinkedHashMap<>();
        for (String key : new String[]{
                "keystrokes","cps","fps","ping","armorHud","potionHud","toggleSprint","toggleSneak",
                "zoom","backview","perspective","reachDisplay","tntTime","timer","timeChanger",
                "fullbright","lowFire","crosshair","hitColor"
        }) map.put(key, switch (key) {
            case "fullbright", "crosshair", "hitColor", "timeChanger" -> false;
            default -> true;
        });
        return map;
    }

    public static DihConfig load() {
        try {
            if (Files.exists(FILE)) {
                DihConfig value = GSON.fromJson(Files.readString(FILE), DihConfig.class);
                if (value != null) {
                    if (value.modules == null) value.modules = defaults();
                    defaults().forEach(value.modules::putIfAbsent);
                    if (value.positions == null) value.positions = new LinkedHashMap<>();
                    value.scale = clamp(value.scale, 0.5, 2.0, 1.0);
                    value.zoomFactor = clamp(value.zoomFactor, 1.1, 12.0, 4.0);
                    value.lowFireOffset = clamp(value.lowFireOffset, 0.0, 1.5, 0.45);
                    value.timeOfDay = Math.max(0, Math.min(23999, value.timeOfDay));
                    return value;
                }
            }
        } catch (Exception ignored) {}
        DihConfig cfg = new DihConfig();
        cfg.save();
        return cfg;
    }

    private static double clamp(double v, double min, double max, double fallback) {
        if (!Double.isFinite(v)) return fallback;
        return Math.max(min, Math.min(max, v));
    }

    public void save() {
        try {
            Files.createDirectories(FILE.getParent());
            Files.writeString(FILE, GSON.toJson(this));
        } catch (IOException ignored) {}
    }

    public boolean on(String key) { return enabled && Boolean.TRUE.equals(modules.get(key)); }
    public void toggle(String key) { modules.put(key, !Boolean.TRUE.equals(modules.get(key))); save(); }
    public HudPosition position(String key, int defaultX, int defaultY) { return positions.getOrDefault(key, new HudPosition(defaultX, defaultY)); }
    public void setPosition(String key, int x, int y) { positions.put(key, new HudPosition(x, y)); }
    public void resetPositions() { positions.clear(); save(); }

    public record HudPosition(int x, int y) {}
}
