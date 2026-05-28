(async () => {
  try {
    if (!globalThis.fetch) {
      console.error('fetch non disponible dans cette version de Node.');
      process.exit(1);
    }

    const loginRes = await fetch('http://localhost:4000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@musulmansdeclamart.fr', password: 'Admin2025!' }),
    });

    const loginJson = await loginRes.json();
    if (!loginRes.ok) {
      console.error('Login failed:', loginJson);
      process.exit(1);
    }

    const token = loginJson.accessToken;

    const statsRes = await fetch('http://localhost:4000/api/admin/stats?scope=current', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const statsJson = await statsRes.json();

    console.log(JSON.stringify({ login: { user: loginJson.user }, stats: statsJson }, null, 2));
  } catch (e) {
    console.error('Error calling API:', e);
    process.exit(1);
  }
})();
