const frame = document.querySelector('iframe'), output = document.querySelector('#evidence');
const send = value => frame.contentWindow.postMessage(value, location.origin);
for (const button of document.querySelectorAll('[data-width]')) button.onclick = () => {frame.style.width = button.dataset.width + 'px'; send({kind: 'journey-measure'});};
for (const button of document.querySelectorAll('[data-language]')) button.onclick = () => send({kind: 'journey-language', value: button.dataset.language});
for (const button of document.querySelectorAll('[data-font]')) button.onclick = () => send({kind: 'journey-font', percent: Number(button.dataset.font)});
for (const button of document.querySelectorAll('[data-control]')) button.onclick = () => send({kind: 'journey-control', action: button.dataset.control, value: button.dataset.value});
document.querySelector('#load').onclick = () => {const view = document.querySelector('#view').value; frame.src = 'frame.html?actor=' + encodeURIComponent(document.querySelector('#actor').value) + '&view=' + encodeURIComponent(view) + (view === 'account' ? '' : '#search');};
document.querySelector('#measure').onclick = () => send({kind: 'journey-measure'});
window.addEventListener('message', event => {if (event.origin === location.origin && event.source === frame.contentWindow) output.textContent = JSON.stringify(event.data, null, 2);});
