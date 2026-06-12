package com.lavexus.familyapp;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.webkit.JavascriptInterface;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // Black-flash fix (bug א): the Capacitor WebView is transparent by default,
    // so during a screen transition (transform/opacity creates a new compositing
    // layer) the black window behind it shows through for a single frame. Paint
    // the WebView itself an opaque warm cream so any un-painted frame is cream,
    // never black. Pairs with android:background/windowBackground in styles.xml.
    try {
      getBridge().getWebView().setBackgroundColor(Color.parseColor("#FFFAF5"));
    } catch (Exception ignored) {}
    // NOTE: software layer (LAYER_TYPE_SOFTWARE) was tried for the black flash but
    // it made scrolling/animations far too slow on the device — reverted. The
    // flash fix is being pursued in CSS/web layer instead.
    // Expose a tiny audio bridge to the web layer so the recording screen can
    // (a) silence the Android speech-recognizer earcons during the continuous
    //     listen/restart loop, and
    // (b) play our own start/stop sounds on a stream that is NOT muted, so the
    //     user hears ONLY the chosen sounds — never the system "beep".
    try {
      getBridge().getWebView().addJavascriptInterface(new RecAudio(this), "RecAudio");
    } catch (Exception ignored) {}
  }

  public static class RecAudio {
    private final Context ctx;
    private boolean muted = false;

    RecAudio(Context c) { ctx = c; }

    /** Mute/unmute the streams the recognizer earcon plays on. Idempotent. */
    @JavascriptInterface
    public void setMuted(boolean m) {
      try {
        AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
        if (am == null || m == muted) return;
        muted = m;
        int[] streams = {
          AudioManager.STREAM_MUSIC,
          AudioManager.STREAM_SYSTEM,
          AudioManager.STREAM_NOTIFICATION
        };
        for (int s : streams) {
          am.adjustStreamVolume(s, m ? AudioManager.ADJUST_MUTE : AudioManager.ADJUST_UNMUTE, 0);
        }
      } catch (Exception ignored) {}
    }

    /** Play a bundled sound (public/sounds/{name}.mp3) on the ALARM stream so
        it stays audible even while STREAM_MUSIC is muted for the earcons. */
    @JavascriptInterface
    public void play(String name) {
      try {
        AssetFileDescriptor afd = ctx.getAssets().openFd("public/sounds/" + name + ".mp3");
        final MediaPlayer mp = new MediaPlayer();
        mp.setAudioAttributes(new AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build());
        mp.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
        afd.close();
        mp.setVolume(0.55f, 0.55f);
        mp.setOnCompletionListener(MediaPlayer::release);
        mp.setOnErrorListener((p, what, extra) -> { p.release(); return true; });
        mp.prepare();
        mp.start();
      } catch (Exception ignored) {}
    }
  }
}
