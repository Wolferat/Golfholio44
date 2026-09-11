import { useParams, useNavigate } from 'react-router-dom';
import LiveScorecard from '@/components/golf/LiveScorecard';

export default function ScorecardLive() {
  const { id } = useParams();
  const navigate = useNavigate();
  return <LiveScorecard cardId={id} onBack={() => navigate('/play')} />;
}