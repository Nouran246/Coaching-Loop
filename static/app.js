// ---------- Mode switching ----------

const tiles = {
  qa: document.getElementById('tile-qa'),
  agent: document.getElementById('tile-agent'),
};

const panels = {
  empty: document.getElementById('panel-empty'),
  qa: document.getElementById('panel-qa'),
  agent: document.getElementById('panel-agent'),
};

const globalDot = document.getElementById('global-status-dot');
const globalText = document.getElementById('global-status-text');

function setMode(mode) {
  Object.entries(tiles).forEach(([key, el]) => {
    el.setAttribute('aria-selected', key === mode ? 'true' : 'false');
  });

  Object.entries(panels).forEach(([key, el]) => {
    el.dataset.active = key === mode ? 'true' : 'false';
  });

  if (mode === 'qa') {
    globalDot.className = 'status-dot idle';
    globalText.textContent = 'QA STATION';
  } else if (mode === 'agent') {
    globalDot.className = 'status-dot idle';
    globalText.textContent = 'AGENT STATION';
  }
}

tiles.qa.addEventListener('click', () => setMode('qa'));
tiles.agent.addEventListener('click', () => setMode('agent'));


// ---------- QA upload ----------

const dropzone = document.getElementById('qa-dropzone');
const fileInput = document.getElementById('qa-file-input');
const fileList = document.getElementById('qa-file-list');
const qaNote = document.getElementById('qa-note');

let uploadedFiles = [];

dropzone.addEventListener('click', () => fileInput.click());

dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});

['dragover', 'dragenter'].forEach(evt =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  })
);

['dragleave', 'drop'].forEach(evt =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
  })
);

dropzone.addEventListener('drop', (e) => {
  const files = Array.from(e.dataTransfer.files || []);
  handleFiles(files);
});

fileInput.addEventListener('change', () => {
  handleFiles(Array.from(fileInput.files || []));
  fileInput.value = '';
});

function handleFiles(files) {
  const allowed = files.filter(f => /\.(pdf|docx)$/i.test(f.name));

  if (allowed.length === 0) {
    qaNote.textContent = 'Only .pdf or .docx files are accepted.';
    return;
  }

  allowed.forEach(uploadFile);
}

async function uploadFile(file) {
  const item = addFileItem(file.name, 'Uploading…');
  const statusBadge = item.querySelector('.file-item-status');

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      throw new Error('upload failed');
    }

    if (statusBadge) statusBadge.textContent = 'Uploaded';

    const data = await res.json();

    uploadedFiles.push(data.filename);

    qaNote.textContent =
      `${uploadedFiles.length} file${uploadedFiles.length > 1 ? 's' : ''} ready for review.`;

    if (statusBadge) statusBadge.textContent = 'Extracting…';

    if (data.extracted && !data.extracted.error) {
      if (statusBadge) {
        statusBadge.textContent = 'Extracted ✓';
        statusBadge.classList.add('status-success');
      }
      renderExtracted(item, data.extracted);
      appendDbStatus(item, data.db_saved);
    } else if (data.extracted && data.extracted.error) {
      if (statusBadge) {
        statusBadge.textContent = 'Extraction failed';
        statusBadge.classList.add('status-error');
      }
      renderExtracted(item, data.extracted);
    } else {
      // File uploaded fine, but the server sent no "extracted" field at all.
      // This means main.py on the server doesn't have extraction wired in yet.
      if (statusBadge) {
        statusBadge.textContent = 'Uploaded (no extraction)';
        statusBadge.classList.add('status-error');
      }
    }

  } catch (err) {
    if (statusBadge) {
      statusBadge.textContent = 'Failed';
      statusBadge.classList.add('status-error');
    }

    qaNote.textContent =
      `Couldn't upload ${file.name}. Try again.`;
  }
}

function appendDbStatus(item, dbSaved) {
  const line = document.createElement('div');
  line.className = 'file-item-db-status';

  if (dbSaved === true) {
    line.textContent = '✓ Saved to database';
    line.classList.add('status-success');
  } else if (dbSaved === false) {
    line.textContent = '✗ Database save failed';
    line.classList.add('status-error');
  } else {
    // dbSaved is undefined -- Supabase isn't wired in on the server yet.
    line.textContent = 'Database: not connected yet';
    line.classList.add('status-pending');
  }

  item.appendChild(line);
}

function renderExtracted(item, extracted) {
  if (extracted.error) {
    const errBox = document.createElement('div');
    errBox.className = 'file-item-extracted file-item-extracted-error';
    errBox.textContent = extracted.error;
    item.appendChild(errBox);
    return;
  }

  const box = document.createElement('div');
  box.className = 'file-item-extracted';

  const rows = [
    ['Agent', `${extracted.agent_name} (#${extracted.agent_id})`],
    ['Call ID', extracted.call_id],
    ['Role', extracted.role],
    ['Date', extracted.evaluation_date],
    ['CSAT', `${extracted.csat_score} / 5.0 (target ${extracted.csat_target})`],
    ['FCR', `${extracted.fcr_percent}% (target ${extracted.fcr_target_percent}%)`],
    ['AHT', `${extracted.aht_display} (target ${extracted.aht_target_seconds}s)`],
    ['Quality Rating', `${extracted.quality_rating_percent}% (target ${extracted.quality_target_percent}%)`],
  ];

  const list = document.createElement('ul');
  list.className = 'extracted-fields';

  rows.forEach(([label, value]) => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${escapeHtml(label)}:</strong> ${escapeHtml(String(value))}`;
    list.appendChild(li);
  });

  box.appendChild(list);

  if (extracted.weaknesses && extracted.weaknesses.length) {
    const wTitle = document.createElement('div');
    wTitle.className = 'extracted-weaknesses-title';
    wTitle.textContent = 'Weaknesses:';
    box.appendChild(wTitle);

    const wList = document.createElement('ul');
    wList.className = 'extracted-weaknesses';
    extracted.weaknesses.forEach(w => {
      const li = document.createElement('li');
      li.textContent = w;
      wList.appendChild(li);
    });
    box.appendChild(wList);
  }

  item.appendChild(box);
}

function addFileItem(name, status) {
  const li = document.createElement('li');

  li.className = 'file-item';

  li.innerHTML = `
    <span class="file-item-name">${escapeHtml(name)}</span>
    <span class="file-item-status">${escapeHtml(status || '')}</span>
    <button
      class="file-item-remove"
      aria-label="Remove ${escapeHtml(name)}"
    >Remove</button>
  `;

  const removeBtn = li.querySelector('.file-item-remove');

  removeBtn.addEventListener('click', () => {
    uploadedFiles = uploadedFiles.filter(f => f !== name);

    li.remove();

    qaNote.textContent = uploadedFiles.length
      ? `${uploadedFiles.length} file${uploadedFiles.length > 1 ? 's' : ''} ready for review.`
      : 'No file uploaded yet.';
  });

  fileList.appendChild(li);

  return li;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}


// ---------- Agent ----------
//
// IMPORTANT:
// The value entered here is the HUMAN COMPANY WORK ID.
//
// Example:
//     EMP-1042
//
// It is NOT the ElevenLabs Agent ID.
//
// The ElevenLabs Workflow Agent ID stays private inside main.py / .env.
//

const agentIdInput = document.getElementById('agent-id-input');
const connectBtn = document.getElementById('agent-connect-btn');
const endBtn = document.getElementById('agent-end-btn');
const connValue = document.getElementById('agent-conn-value');
const modeValue = document.getElementById('agent-mode-value');
const transcript = document.getElementById('agent-transcript');

let conversation = null;


function addTranscriptLine(who, text) {
  const line = document.createElement('div');

  line.className = 'transcript-line';

  line.innerHTML =
    `<span class="who">${escapeHtml(who)}</span>${escapeHtml(text)}`;

  transcript.appendChild(line);

  transcript.scrollTop = transcript.scrollHeight;
}


// ---------- Connect Agent ----------

connectBtn.addEventListener('click', async () => {

  // This is the HUMAN'S company Work ID.
  const workId = agentIdInput.value.trim();

  if (!workId) {
    connValue.textContent = 'Enter your Work ID first';
    connValue.className = 'readout-value error';
    return;
  }

  connectBtn.disabled = true;

  connValue.textContent = 'Requesting access…';
  connValue.className = 'readout-value';

  globalDot.className = 'status-dot busy';
  globalText.textContent = 'CONNECTING';

  try {

    // Load ElevenLabs browser SDK.
    const { Conversation } =
      await import('https://esm.sh/@elevenlabs/client');


    // Ask for microphone permission.
    await navigator.mediaDevices.getUserMedia({
      audio: true
    });


    // --------------------------------------------------
    // IMPORTANT:
    //
    // We DO NOT send an ElevenLabs Agent ID here.
    //
    // We send the HUMAN Work ID to our backend.
    //
    // main.py will use the private ElevenLabs workflow
    // Agent ID stored in .env.
    // --------------------------------------------------

    const res = await fetch('/api/get-signed-url', {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
      },

      body: JSON.stringify({
        work_id: workId,
      }),
    });


    if (!res.ok) {

      let message = 'Could not get a signed URL';

      try {
        const errorData = await res.json();

        if (errorData?.detail) {
          message = errorData.detail;
        }

      } catch (_) {
        // Keep default error message.
      }

      throw new Error(message);
    }


    const { signed_url } = await res.json();


    if (!signed_url) {
      throw new Error('Server did not return a signed URL');
    }


    // --------------------------------------------------
    // Start the ElevenLabs workflow.
    //
    // This connects to the workflow configured on the
    // backend, NOT an Agent ID entered by the user.
    // --------------------------------------------------

    conversation = await Conversation.startSession({

      signedUrl: signed_url,


      // ---------- Connected ----------

      onConnect: () => {

        connValue.textContent = 'Connected';
        connValue.className = 'readout-value live';

        globalDot.className = 'status-dot active';
        globalText.textContent = 'AGENT LIVE';

        connectBtn.disabled = true;
        endBtn.disabled = false;

        addTranscriptLine(
          'system',
          `Session started for Work ID: ${workId}`
        );
      },


      // ---------- Messages ----------

      onMessage: (msg) => {

        console.log(
          'ElevenLabs event:',
          msg
        );


        // Normal conversation message.
        if (msg?.message) {

          addTranscriptLine(
            msg.source === 'user'
              ? 'you'
              : 'agent',
            msg.message
          );

          return;
        }


        // Debug / workflow events.
        //
        // If enabled in ElevenLabs, these can expose
        // events such as:
        //
        // Intent Detection
        // Coaching
        // Roleplay
        // Evaluation
        //

        if (msg?.type) {

          addTranscriptLine(
            'system',
            `[${msg.type}] ${JSON.stringify(msg).slice(0, 500)}`
          );
        }
      },


      // ---------- Mode ----------

      onModeChange: (m) => {

        if (m?.mode) {
          modeValue.textContent = m.mode;
        }
      },


      // ---------- Disconnect ----------

      onDisconnect: () => {

        connValue.textContent = 'Not connected';
        connValue.className = 'readout-value';

        modeValue.textContent = '—';

        globalDot.className = 'status-dot idle';
        globalText.textContent = 'AGENT STATION';

        connectBtn.disabled = false;
        endBtn.disabled = true;

        conversation = null;

        addTranscriptLine(
          'system',
          'Session ended.'
        );
      }
    });


  } catch (err) {

    console.error(
      'ElevenLabs connection error:',
      err
    );

    connValue.textContent =
      err.message || 'Connection failed';

    connValue.className =
      'readout-value error';

    globalDot.className =
      'status-dot idle';

    globalText.textContent =
      'AGENT STATION';

    connectBtn.disabled = false;
    endBtn.disabled = true;

    conversation = null;
  }
});


// ---------- End session ----------

endBtn.addEventListener('click', async () => {

  if (!conversation) {
    return;
  }

  try {

    await conversation.endSession();

  } catch (err) {

    console.error(
      'Failed to end conversation:',
      err
    );

  } finally {

    conversation = null;
    endBtn.disabled = true;
    connectBtn.disabled = false;
  }
});