const engine = new AudioEngine();
let progressInterval = null;

const $ = id => document.getElementById(id);

async function initApp() {
  await engine.init();
  engine.setAntiRecording(true);

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

  $('phase-toggle').addEventListener('change', () => {
    const active = $('phase-toggle').checked;
    engine.setAntiRecording(active);
    if (active) {
      $('status-badge').textContent = '🛡️ حماية عكس الطور نشطة';
      $('status-badge').className = 'badge badge-success';
    } else {
      $('status-badge').textContent = '⚠️ حماية عكس الطور معطلة';
      $('status-badge').className = 'badge badge-danger';
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
  });
});
