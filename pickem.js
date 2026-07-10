(() => {
  'use strict';

  const SUPABASE_URL = 'https://oxarwtguzggvhhrvhkfw.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_XXuJ31qhhA_-JCJOS8Qdng_i5aiMKig';
  const DINNER_KEY = 'gj-pickem-dinner-total-v1';
  const POLL_MS = 5000;
  const els = {};
  let state = null;
  let session = null;
  let pollTimer = null;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const saveSession = value => { session = value; };
  const getDinnerTotal = () => {
    const value = Number(localStorage.getItem(DINNER_KEY));
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  };
  const won = value => `${Math.round(value).toLocaleString('ko-KR')}원`;

  async function rpc(name, payload) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || `HTTP ${response.status}`);
    return body;
  }

  const statusText = event => {
    if (event.status === 'completed') return 'RESULT';
    if (event.status === 'cancelled') return 'CANCELLED';
    if (event.status === 'unconfirmed') return 'TO BE CONFIRMED';
    return event.locked ? 'LOCKED' : 'OPEN';
  };

  const koreanTime = iso => iso ? new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit'
  }).format(new Date(iso)) : '일정 미확정';

  const countdown = iso => {
    if (!iso) return '공식 일정 발표 대기';
    let diff = new Date(iso).getTime() - Date.now();
    if (diff <= 0) return '예측 마감';
    const days = Math.floor(diff / 86400000); diff %= 86400000;
    const hours = Math.floor(diff / 3600000); diff %= 3600000;
    const mins = Math.floor(diff / 60000);
    return `${days ? `${days}일 ` : ''}${hours}시간 ${mins}분 후 마감`;
  };

  async function loadState({quiet = false} = {}) {
    if (!quiet) setSync('불러오는 중');
    try {
      const credentials = session || {};
      state = await rpc('pickem_get_state', {
        p_player_slug: credentials.player || null
      });
      if (session && !state.player_valid) {
        saveSession(null);
        state = await rpc('pickem_get_state', {p_player_slug: null});
        showMessage('선택한 이름을 찾지 못했습니다. 다시 선택해 주세요.', true);
      }
      populatePlayers();
      render();
      setSync('5초마다 자동 갱신');
    } catch (error) {
      setSync('연결 실패', true);
      if (!quiet) showMessage('예측 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.', true);
      console.error(error);
    }
  }

  function setSync(text, error = false) {
    if (!els.sync) return;
    els.sync.textContent = text;
    els.sync.parentElement.classList.toggle('error', error);
  }

  function showMessage(text, error = false) {
    els.loginState.textContent = text;
    els.loginState.classList.toggle('error', error);
  }

  function populatePlayers() {
    if (!state || els.playerGrid.dataset.ready) return;
    els.playerGrid.innerHTML = state.players.map(player => `<button type="button" data-player="${esc(player.slug)}"><span class="eyebrow">PLAYER</span><b>${esc(player.name)}</b><small>이 이름으로 입장 →</small></button>`).join('');
    els.playerGrid.dataset.ready = 'true';
    els.playerGrid.querySelectorAll('[data-player]').forEach(button => button.addEventListener('click', () => onLogin(button.dataset.player)));
  }

  function render() {
    if (!state) return;
    const current = state.players.find(player => player.slug === session?.player);
    const loggedIn = Boolean(state.player_valid && current);
    els.gate.hidden = loggedIn;
    els.app.hidden = !loggedIn;
    if (!loggedIn) {
      showMessage('내 이름을 선택해 경주토토에 입장하세요.');
      return;
    }
    els.currentPlayer.textContent = `${current.name}으로 입장 중`;
    els.events.innerHTML = state.events.map(renderEvent).join('');
    bindPickButtons();
    renderSettlement();
    setupAdmin();
  }

  function renderEvent(event) {
    const canPick = state.player_valid && event.status === 'scheduled' && !event.locked;
    const options = [event.option_a, event.option_b].filter(Boolean);
    const pickButtons = options.map(option => {
      const active = event.own_selection === option;
      const count = Number(event.counts?.[option] || 0);
      const odd = event.odds?.[option];
      const names = (event.picks || []).filter(pick => pick.selection === option).map(pick => pick.player);
      const result = event.status === 'completed' && event.winner === option;
      return `<button class="pick-option${active ? ' active' : ''}${result ? ' winner' : ''}" type="button" data-event="${esc(event.slug)}" data-selection="${esc(option)}" ${canPick ? '' : 'disabled'}>
        <span class="pick-mark">${result ? 'WINNER' : active ? 'MY PICK' : 'PICK'}</span><b>${esc(option)}</b>
        ${event.locked || event.status === 'completed' ? `<span class="pick-odd">${count}명 · ${odd ? `×${esc(odd)}` : '—'}</span><small>${names.length ? esc(names.join(' · ')) : '선택 없음'}</small>` : '<span class="pick-odd">선택하기</span>'}
      </button>`;
    }).join('');
    const notice = event.status === 'unconfirmed'
      ? `<div class="event-notice">${esc(event.source_note || '공식 일정 확정 대기')}</div>`
      : event.status === 'cancelled' ? '<div class="event-notice">취소된 경기입니다.</div>'
      : event.locked ? '<div class="event-notice locked">경기가 시작되어 선택이 공개됐습니다.</div>'
      : `<div class="event-notice">${state.player_valid ? '선택 버튼을 다시 누르면 경기 전까지 변경할 수 있습니다.' : '이름을 선택하면 예측할 수 있습니다.'}</div>`;
    return `<article class="pickem-card ${event.status}">
      <div class="pickem-card-head"><div><span class="eyebrow red">${esc(event.category)}</span><h3>${esc(event.title)}</h3></div><span class="event-status ${event.locked ? 'locked' : ''}">${statusText(event)}</span></div>
      <div class="event-time"><b>${esc(koreanTime(event.starts_at))}</b><span>${esc(countdown(event.starts_at))}</span></div>
      <div class="pick-progress"><span>제출 ${esc(event.submitted_count)} / ${state.players.length}</span><i style="--progress:${state.players.length ? Number(event.submitted_count) / state.players.length * 100 : 0}%"></i></div>
      <div class="pick-options">${pickButtons || '<p class="muted">선택지가 아직 없습니다.</p>'}</div>
      ${notice}
      <div class="event-source"><span>${esc(event.subtitle || '')}</span>${event.source_url ? `<a href="${esc(event.source_url)}" target="_blank" rel="noopener">공식 일정 ↗</a>` : ''}</div>
    </article>`;
  }

  function bindPickButtons() {
    els.events.querySelectorAll('[data-event][data-selection]:not(:disabled)').forEach(button => {
      button.addEventListener('click', async () => {
        if (!session) return;
        button.disabled = true;
        setSync('선택 저장 중');
        try {
          await rpc('pickem_submit_pick', {
            p_player_slug: session.player,
            p_event_slug: button.dataset.event,
            p_selection: button.dataset.selection
          });
          window.GJRM?.toast(`${button.dataset.selection} 선택을 저장했습니다.`);
          await loadState({quiet: true});
        } catch (error) {
          const locked = /PICK_LOCKED/.test(error.message);
          window.GJRM?.toast(locked ? '경기가 시작되어 예측이 잠겼습니다.' : '선택을 저장하지 못했습니다.');
          await loadState({quiet: true});
        }
      });
    });
  }

  function renderSettlement() {
    const completed = state.events.filter(event => event.status === 'completed' && event.winner);
    const dinnerTotal = getDinnerTotal();
    if (!completed.length) {
      els.settlement.innerHTML = `<p class="muted">경기 결과가 확정되면 점수와 저녁값 부담 비율이 자동 계산됩니다.${dinnerTotal ? `<br>저장된 총액: <b>${won(dinnerTotal)}</b>` : ''}</p>`;
      return;
    }
    const scores = Object.fromEntries(state.players.map(player => [player.slug, {name: player.name, points: 0, correct: 0}]));
    completed.forEach(event => {
      const multiplier = Number(event.odds?.[event.winner] || 0);
      (event.picks || []).filter(pick => pick.selection === event.winner).forEach(pick => {
        if (!scores[pick.player_slug]) return;
        scores[pick.player_slug].points += multiplier;
        scores[pick.player_slug].correct += 1;
      });
    });
    const rows = Object.values(scores);
    const weights = rows.map(row => 1 / (1 + row.points));
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    const shares = weights.map(value => totalWeight ? value / totalWeight : 1 / rows.length);
    const amounts = allocateWon(dinnerTotal, shares);
    els.settlement.innerHTML = rows.map((row, index) => {
      const share = shares[index] * 100;
      return `<article><span class="eyebrow">${esc(row.correct)} CORRECT</span><b>${esc(row.name)}</b><strong>${share.toFixed(1)}%</strong>${dinnerTotal ? `<em>${won(amounts[index])}</em>` : ''}<small>${row.points.toFixed(2)}점</small></article>`;
    }).join('');
  }

  function allocateWon(total, shares) {
    if (!total) return shares.map(() => 0);
    const exact = shares.map(share => total * share);
    const amounts = exact.map(Math.floor);
    let remainder = total - amounts.reduce((sum, value) => sum + value, 0);
    exact.map((value, index) => ({index, fraction: value - amounts[index]}))
      .sort((a, b) => b.fraction - a.fraction)
      .slice(0, remainder)
      .forEach(item => { amounts[item.index] += 1; });
    return amounts;
  }

  function onDinnerSubmit(event) {
    event.preventDefault();
    const digits = els.dinnerInput.value.replace(/[^0-9]/g, '');
    const total = Number(digits);
    if (!Number.isSafeInteger(total) || total <= 0) {
      els.dinnerState.textContent = '1원 이상의 총 결제 금액을 입력해 주세요.';
      els.dinnerState.classList.add('error');
      els.dinnerInput.focus();
      return;
    }
    localStorage.setItem(DINNER_KEY, String(total));
    els.dinnerInput.value = total.toLocaleString('ko-KR');
    els.dinnerState.textContent = `${won(total)} 저장 완료 · 이 브라우저에 보관됩니다.`;
    els.dinnerState.classList.remove('error');
    renderSettlement();
  }

  function setupAdmin() {
    if (!new URLSearchParams(location.search).has('admin') || els.admin.dataset.ready) return;
    els.admin.hidden = false;
    els.admin.dataset.ready = 'true';
    state.events.forEach(event => els.adminEvent.add(new Option(event.title, event.slug)));
    const fill = () => {
      const event = state.events.find(item => item.slug === els.adminEvent.value);
      if (!event) return;
      els.adminForm.optionA.value = event.option_a || '';
      els.adminForm.optionB.value = event.option_b || '';
      els.adminForm.startsAt.value = event.starts_at ? new Date(new Date(event.starts_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0,16) : '';
      els.adminForm.status.value = event.status;
      fillWinner(event.winner || '');
    };
    const fillWinner = selected => {
      const values = ['', els.adminForm.optionA.value, els.adminForm.optionB.value].filter((v, i, a) => a.indexOf(v) === i);
      els.adminForm.winner.innerHTML = values.map(value => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${value || '미입력'}</option>`).join('');
    };
    els.adminEvent.addEventListener('change', fill);
    els.adminForm.optionA.addEventListener('input', () => fillWinner(''));
    els.adminForm.optionB.addEventListener('input', () => fillWinner(''));
    fill();
  }

  async function onAdminSubmit(event) {
    event.preventDefault();
    const form = new FormData(els.adminForm);
    try {
      await rpc('pickem_admin_update_event', {
        p_admin_pin: form.get('adminPin'), p_event_slug: form.get('event'),
        p_option_a: form.get('optionA'), p_option_b: form.get('optionB'),
        p_starts_at: form.get('startsAt') ? new Date(form.get('startsAt')).toISOString() : null,
        p_status: form.get('status'), p_winner: form.get('winner') || null
      });
      window.GJRM?.toast('경기 정보를 저장했습니다.');
      els.adminForm.adminPin.value = '';
      await loadState();
    } catch (error) {
      window.GJRM?.toast('운영자 정보 저장에 실패했습니다.');
      console.error(error);
    }
  }

  async function onLogin(player) {
    if (!player) return;
    showMessage('경주토토에 입장하는 중…');
    els.playerGrid.querySelectorAll('button').forEach(button => { button.disabled = true; });
    saveSession({player});
    await loadState();
    if (!state?.player_valid) {
      saveSession(null);
      els.playerGrid.querySelectorAll('button').forEach(button => { button.disabled = false; });
    }
  }

  async function changePlayer() {
    saveSession(null);
    els.app.hidden = true;
    els.gate.hidden = false;
    els.playerGrid.querySelectorAll('button').forEach(button => { button.disabled = false; });
    showMessage('다른 이름을 선택해 주세요.');
    await loadState({quiet: true});
  }

  document.addEventListener('DOMContentLoaded', () => {
    els.gate = document.querySelector('[data-toto-gate]');
    els.app = document.querySelector('[data-toto-app]');
    els.playerGrid = document.querySelector('[data-player-grid]');
    els.loginState = document.querySelector('[data-login-state]');
    els.currentPlayer = document.querySelector('[data-current-player]');
    els.events = document.querySelector('[data-events]');
    els.settlement = document.querySelector('[data-settlement]');
    els.dinnerForm = document.querySelector('[data-dinner-form]');
    els.dinnerInput = els.dinnerForm.dinnerTotal;
    els.dinnerState = document.querySelector('[data-dinner-state]');
    els.sync = document.querySelector('[data-sync-state]');
    els.admin = document.querySelector('[data-admin-zone]');
    els.adminForm = document.querySelector('[data-admin-form]');
    els.adminEvent = els.adminForm.event;
    session = null;
    document.querySelector('[data-change-player]').addEventListener('click', changePlayer);
    els.dinnerForm.addEventListener('submit', onDinnerSubmit);
    els.dinnerInput.addEventListener('focus', () => { els.dinnerInput.value = els.dinnerInput.value.replace(/[^0-9]/g, ''); });
    els.dinnerInput.addEventListener('blur', () => { const value = Number(els.dinnerInput.value.replace(/[^0-9]/g, '')); els.dinnerInput.value = value ? value.toLocaleString('ko-KR') : ''; });
    const savedDinnerTotal = getDinnerTotal();
    if (savedDinnerTotal) {
      els.dinnerInput.value = savedDinnerTotal.toLocaleString('ko-KR');
      els.dinnerState.textContent = `${won(savedDinnerTotal)} 저장됨 · 금액을 바꾸면 다시 저장해 주세요.`;
    }
    document.querySelector('[data-refresh]').addEventListener('click', () => loadState());
    els.adminForm.addEventListener('submit', onAdminSubmit);
    loadState();
    pollTimer = setInterval(() => loadState({quiet: true}), POLL_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) loadState({quiet: true}); });
  });
})();
