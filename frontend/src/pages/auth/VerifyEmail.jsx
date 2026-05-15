import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import api from '../../api/axios';
import { FiCheckCircle, FiXCircle } from 'react-icons/fi';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading'); // loading, success, error

  useEffect(() => {
    const token = searchParams.get('token');
    const redirectPath = searchParams.get('redirect') || '/login';
    
    if (!token) { 
      setStatus('error'); 
      return; 
    }

    api.get(`/auth/verify-email/${token}`)
      .then(() => {
        setStatus('success');
        setTimeout(() => {
          navigate(redirectPath);
        }, 2000);
      })
      .catch(() => setStatus('error'));
  }, [searchParams, navigate]);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #213B88 0%, #0088CC 100%)', padding: 20,
    }}>
      <div style={{
        background: 'white', borderRadius: 12, padding: '48px 36px', maxWidth: 440,
        width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        {status === 'loading' && <p>Vérification en cours...</p>}
        {status === 'success' && (
          <>
            <FiCheckCircle size={64} color="#22C55E" />
            <h2 style={{ color: 'var(--amc-primary)', margin: '16px 0 8px' }}>Email vérifié !</h2>
            <p style={{ color: '#6B7280', marginBottom: 24 }}>Votre adresse email a été confirmée avec succès. Redirection en cours...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <FiXCircle size={64} color="#EF4444" />
            <h2 style={{ color: '#EF4444', margin: '16px 0 8px' }}>Lien invalide</h2>
            <p style={{ color: '#6B7280', marginBottom: 24 }}>Ce lien de vérification est invalide ou a expiré.</p>
            <Link to="/login" className="btn btn-primary">Retour</Link>
          </>
        )}
      </div>
    </div>
  );
}
