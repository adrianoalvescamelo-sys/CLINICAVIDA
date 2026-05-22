import { Navigate } from 'react-router-dom';
import { useAuthStore, type AuthUser } from '../store/auth';

type Perfil = AuthUser['perfil'];

interface Props {
  children: JSX.Element;
  allow: Perfil[];
}

export default function RoleRoute({ children, allow }: Props) {
  const { token, user } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  if (!user || !allow.includes(user.perfil)) return <Navigate to="/" replace />;
  return children;
}
