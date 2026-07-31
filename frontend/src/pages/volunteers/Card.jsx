import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';

const BACKEND_ORIGIN = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/api$/, '')
  : (import.meta.env.DEV ? 'http://localhost:4000' : '');

const photoSrc = (url) => (!url ? null : url.startsWith('http') ? url : `${BACKEND_ORIGIN}${url}`);

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function VolunteerCard() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/volunteers/me')
      .then(({ data }) => setProfile(data.volunteer))
      .catch(() => toast.error('Impossible de charger votre carte'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Chargement…</p>;
  if (!profile) return null;

  return (
    <div>
      <h2 style={{ color: 'var(--amc-primary)', marginBottom: 16 }}>Ma carte bénévole</h2>

      <div style={{ display: 'flex', justifyContent: 'center', padding: '0 8px' }}>
        <div
          style={{
            width: '100%',
            maxWidth: 380,
            borderRadius: 20,
            overflow: 'hidden',
            boxShadow: '0 12px 32px rgba(33,59,136,0.25)',
            background: '#fff',
          }}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, #213B88 0%, #0088CC 100%)',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
            }}
          >
            <img src="/amc_logo.png" alt="AMC" style={{ height: 34, objectFit: 'contain', background: '#fff', borderRadius: 6, padding: '2px 6px' }} />
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 13, letterSpacing: 1, textAlign: 'center' }}>CARTE BÉNÉVOLE</span>
            <img src="/amc_logo_partner.png" alt="PARTAGE" style={{ height: 34, objectFit: 'contain', background: '#fff', borderRadius: 6, padding: '2px 6px' }} />
          </div>

          <div style={{ padding: '28px 24px 24px', textAlign: 'center' }}>
            <div
              style={{
                width: 112,
                height: 112,
                borderRadius: '50%',
                margin: '0 auto 16px',
                overflow: 'hidden',
                background: '#EEF2FF',
                border: '4px solid var(--amc-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {profile.photoUrl ? (
                <img src={photoSrc(profile.photoUrl)} alt={`${profile.firstName} ${profile.lastName}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 34, fontWeight: 700, color: 'var(--amc-primary)' }}>
                  {profile.firstName?.[0]}{profile.lastName?.[0]}
                </span>
              )}
            </div>

            <h3 style={{ margin: '0 0 4px', color: 'var(--amc-primary)', fontSize: 22 }}>{profile.firstName} {profile.lastName}</h3>
            <p style={{ margin: '0 0 20px', color: '#6B7280', fontSize: 13, fontWeight: 600, letterSpacing: 0.5 }}>BÉNÉVOLE</p>

            <div style={{ borderTop: '1px dashed var(--amc-border)', paddingTop: 16 }}>
              <p style={{ margin: 0, fontSize: 12, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Membre depuis</p>
              <p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 700, color: '#374151' }}>{fmtDate(profile.createdAt)}</p>
            </div>
          </div>

          <div style={{ background: '#37373F', padding: '8px 20px', textAlign: 'center' }}>
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>Association Partage et des Musulmans de Clamart</span>
          </div>
        </div>
      </div>
    </div>
  );
}
