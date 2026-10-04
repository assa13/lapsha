import './style.css';

const app = document.querySelector('#app');
app.innerHTML = `
  <main class="shell">
    <section class="game-frame">
      <div class="hud">Jelly Pop prototype</div>
      <canvas id="game"></canvas>
    </section>
  </main>
`;
