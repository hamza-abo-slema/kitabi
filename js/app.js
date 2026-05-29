const engine = new AudioEngine();
let detector = null;
let progressInterval = null;

const $ = id => document.getElementById(id);

async function initApp() {
  await engine.init();

  detector = new RecorderDetector((active, source) => {
    engine.setAntiRecording(true);
    $('status-badge').textContent = '⚠ Anti-Recording ACTIVE';
    $('status-badge').className = 'badge badge-danger';
    $('log').textContent += `[${source}] Screen recording detected → phase inversion engaged\n`;
  });

  $('play-btn').addEventListener('click', () => {
    if (engine.isPlaying) {
      engine.pause();
      $('play-btn').textContent = '▶ Resume';
    } else {
      engine.play();
      $('play-btn').textContent = '⏸ Pause';
      startProgress();
    }
  });

  $('stop-btn').addEventListener('click', () => {
    engine.stop();
    $('play-btn').textContent = '▶ Play';
    stopProgress();
  });

  $('test-btn').addEventListener('click', () => {
    const active = !engine.antiRecActive;
    engine.setAntiRecording(active);
    detector.recording = active;
    if (active) {
      $('status-badge').textContent = '⚠ Anti-Recording ACTIVE (test)';
      $('status-badge').className = 'badge badge-danger';
      $('log').textContent += '[test] Manual anti-recording enabled\n';
    } else {
      $('status-badge').textContent = '✅ Normal Playback';
      $('status-badge').className = 'badge badge-success';
      $('log').textContent += '[test] Manual anti-recording disabled\n';
    }
  });
}

function startProgress() {
  stopProgress();
  progressInterval = setInterval(() => {
    const cur = engine.getCurrentTime();
    const dur = engine.getDuration();
    if (dur > 0) {
      $('progress').value = (cur / dur) * 100;
      $('time').textContent = `${fmtTime(cur)} / ${fmtTime(dur)}`;
    }
  }, 200);
}

function stopProgress() {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
  $('progress').value = 0;
  $('time').textContent = '0:00 / 0:00';
}

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

document.addEventListener('DOMContentLoaded', () => {
  initApp();
  const audioPath = 'audio/جزء من رأس ميدوسا.mp3';
  engine.loadAudio(audioPath).then(() => {
    $('track-name').textContent = decodeURIComponent(audioPath.split('/').pop());
    $('dur').textContent = fmtTime(engine.getDuration());
    $('loading').style.display = 'none';
    $('controls').style.display = 'flex';
  }).catch(e => {
    $('loading').textContent = '❌ فشل تحميل الملف الصوتي';
    $('log').textContent += '[error] Failed to load audio file\n';
  });
});
