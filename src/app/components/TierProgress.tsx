import { Award, Crown, Gem } from "lucide-react";
import { Progress } from "./ui/progress";

interface TierProgressProps {
  currentPoints: number;
}

export function TierProgress({ currentPoints }: TierProgressProps) {
  const tiers = [
    { name: "Silver", points: 0, icon: Award, color: "text-gray-400" },
    { name: "Gold", points: 500, icon: Crown, color: "text-yellow-500" },
    { name: "Diamond", points: 1000, icon: Gem, color: "text-accent" },
  ];

  const getCurrentTier = () => {
    if (currentPoints >= 1000) return 2;
    if (currentPoints >= 500) return 1;
    return 0;
  };

  const currentTier = getCurrentTier();
  const nextTier = currentTier < 2 ? currentTier + 1 : 2;
  const nextTierPoints = tiers[nextTier].points;
  const prevTierPoints = tiers[currentTier].points;
  const progress = nextTierPoints > prevTierPoints
    ? ((currentPoints - prevTierPoints) / (nextTierPoints - prevTierPoints)) * 100
    : 100;

  return (
    <div className="bg-white rounded-xl shadow-md p-5">
      <h3 className="font-semibold mb-4">Loyalty Tier Progress</h3>
      
      <div className="flex justify-between mb-6">
        {tiers.map((tier, index) => {
          const Icon = tier.icon;
          const isActive = index <= currentTier;
          const isCurrent = index === currentTier;
          
          return (
            <div key={tier.name} className="flex flex-col items-center flex-1">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-gray-100 text-gray-400"
                } ${isCurrent ? "ring-4 ring-primary/20" : ""}`}
              >
                <Icon className="w-6 h-6" />
              </div>
              <span className={`text-xs font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                {tier.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {tier.points} pts
              </span>
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Current Points</span>
          <span className="font-semibold">{currentPoints} pts</span>
        </div>
        <Progress value={progress} className="h-2" />
        {currentTier < 2 && (
          <p className="text-xs text-muted-foreground text-center">
            {nextTierPoints - currentPoints} points to {tiers[nextTier].name}
          </p>
        )}
      </div>
    </div>
  );
}
