package dev.dih.client;

import java.util.ArrayDeque;
import java.util.Deque;

public final class CpsTracker {
    private static final Deque<Long> LEFT = new ArrayDeque<>();
    private static final Deque<Long> RIGHT = new ArrayDeque<>();
    private CpsTracker() {}

    public static void click(int button) {
        if (button == 0) LEFT.addLast(System.currentTimeMillis());
        if (button == 1) RIGHT.addLast(System.currentTimeMillis());
        prune();
    }

    public static int left() { prune(); return LEFT.size(); }
    public static int right() { prune(); return RIGHT.size(); }
    private static void prune() {
        long cutoff = System.currentTimeMillis() - 1000L;
        while (!LEFT.isEmpty() && LEFT.peekFirst() < cutoff) LEFT.removeFirst();
        while (!RIGHT.isEmpty() && RIGHT.peekFirst() < cutoff) RIGHT.removeFirst();
    }
}
