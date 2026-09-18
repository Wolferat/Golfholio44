import { Image } from '@/components/ui/image';

// Distinct Golfolio category placeholder — clearly generic, not a real venue
// photo. Used when no verified official photo passes automated checks.
export const PLACEHOLDER_IMG =
  'https://media.base44.com/images/public/6aa36b30315f233cc3d6a9b6/6a4eb8dd2_generated_image.png';

export default function CategoryPlaceholder({ className }) {
  return <Image src={PLACEHOLDER_IMG} fittingType="fill" className={className} />;
}