/**
 * Onboarding Wizard Component
 *
 * Guides new users through setting up their profile for personalized calorie targets.
 * Triggers when user_targets is empty or profile is incomplete.
 */

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Loader2, User, Activity, Scale, CheckCircle, ArrowRight } from 'lucide-react';
import { ACTIVITY_LEVELS, GENDERS } from '@/lib/tdee';

interface OnboardingWizardProps {
  onComplete?: () => void;
}

type Step = 'welcome' | 'personal' | 'activity' | 'goal' | 'complete';

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [profile, setProfile] = useState({
    birthDate: '',
    gender: '' as string,
    heightCm: '',
    activityLevel: '' as string,
    weightGoal: 'maintain',
  });

  // Calculate progress
  const getProgress = () => {
    const steps: Step[] = ['welcome', 'personal', 'activity', 'goal', 'complete'];
    const currentIndex = steps.indexOf(currentStep);
    return ((currentIndex + 1) / steps.length) * 100;
  };

  // Validate current step before proceeding
  const canProceed = () => {
    switch (currentStep) {
      case 'welcome':
        return true;
      case 'personal':
        return profile.birthDate && profile.gender && profile.heightCm;
      case 'activity':
        return profile.activityLevel !== '';
      case 'goal':
        return profile.weightGoal !== '';
      default:
        return true;
    }
  };

  const handleNext = () => {
    setError(null);
    switch (currentStep) {
      case 'welcome':
        setCurrentStep('personal');
        break;
      case 'personal':
        if (!canProceed()) {
          setError('Please fill in all fields');
          return;
        }
        setCurrentStep('activity');
        break;
      case 'activity':
        if (!canProceed()) {
          setError('Please select an activity level');
          return;
        }
        setCurrentStep('goal');
        break;
      case 'goal':
        if (!canProceed()) {
          setError('Please select a weight goal');
          return;
        }
        handleSubmit();
        break;
      case 'complete':
        onComplete?.();
        break;
    }
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          birthDate: profile.birthDate || undefined,
          gender: profile.gender || undefined,
          heightCm: profile.heightCm ? parseInt(profile.heightCm) : undefined,
          activityLevel: profile.activityLevel || undefined,
          weightGoal: profile.weightGoal,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save profile');
      }

      setCurrentStep('complete');
      onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'welcome':
        return (
          <div className="text-center space-y-4 py-6">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
              <User className="w-8 h-8 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold">Welcome!</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Let&apos;s set up your profile to get personalized nutrition recommendations.
              This will only take a minute.
            </p>
          </div>
        );

      case 'personal':
        return (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2 mb-4">
              <User className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold">Personal Information</h3>
            </div>

            <div className="space-y-2">
              <Label htmlFor="birthDate">Birth Date</Label>
              <Input
                id="birthDate"
                type="date"
                value={profile.birthDate}
                onChange={(e) => setProfile({ ...profile, birthDate: e.target.value })}
                max={new Date().toISOString().split('T')[0]}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="gender">Gender</Label>
              <Select
                value={profile.gender || undefined}
                onValueChange={(value: string | null) => setProfile({ ...profile, gender: value || '' })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  {GENDERS.map((g) => (
                    <SelectItem key={g.value} value={g.value}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="heightCm">Height (cm)</Label>
              <Input
                id="heightCm"
                type="number"
                min="50"
                max="300"
                placeholder="e.g., 175"
                value={profile.heightCm}
                onChange={(e) => setProfile({ ...profile, heightCm: e.target.value })}
              />
            </div>
          </div>
        );

      case 'activity':
        return (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold">Activity Level</h3>
            </div>

            <p className="text-sm text-muted-foreground">
              How active are you on a typical week?
            </p>

            <div className="space-y-2">
              <Label>Activity Level</Label>
              <Select
                value={profile.activityLevel || undefined}
                onValueChange={(value: string | null) => setProfile({ ...profile, activityLevel: value || '' })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select activity level" />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_LEVELS.map((level) => (
                    <SelectItem key={level.value} value={level.value}>
                      {level.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {profile.activityLevel && (
                <p className="text-xs text-muted-foreground">
                  {ACTIVITY_LEVELS.find((l) => l.value === profile.activityLevel)?.description}
                </p>
              )}
            </div>
          </div>
        );

      case 'goal':
        return (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2 mb-4">
              <Scale className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold">Weight Goal</h3>
            </div>

            <p className="text-sm text-muted-foreground">
              What&apos;s your primary goal?
            </p>

            <div className="space-y-2">
              <Label>Goal</Label>
              <Select
                value={profile.weightGoal || undefined}
                onValueChange={(value: string | null) => setProfile({ ...profile, weightGoal: value || 'maintain' })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select goal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lose">Lose Weight</SelectItem>
                  <SelectItem value="maintain">Maintain Weight</SelectItem>
                  <SelectItem value="gain">Gain Weight</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground">
                {profile.weightGoal === 'lose' && 'Target: -500 cal/day deficit for ~0.5kg/week loss'}
                {profile.weightGoal === 'maintain' && 'Target: Maintain current weight'}
                {profile.weightGoal === 'gain' && 'Target: +500 cal/day surplus for ~0.5kg/week gain'}
              </div>
            </div>
          </div>
        );

      case 'complete':
        return (
          <div className="text-center space-y-4 py-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold">You&apos;re All Set!</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Your profile has been saved. You can now start tracking your meals and see
              personalized calorie recommendations.
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              {currentStep === 'welcome' && 'Welcome!'}
              {currentStep === 'personal' && 'About You'}
              {currentStep === 'activity' && 'Activity Level'}
              {currentStep === 'goal' && 'Your Goal'}
              {currentStep === 'complete' && 'Complete!'}
            </CardTitle>
            {currentStep !== 'welcome' && currentStep !== 'complete' && (
              <span className="text-xs text-muted-foreground">
                Step {['welcome', 'personal', 'activity', 'goal', 'complete'].indexOf(currentStep) + 1} of 5
              </span>
            )}
          </div>
          {currentStep !== 'welcome' && currentStep !== 'complete' && (
            <Progress value={getProgress()} className="h-2" />
          )}
        </CardHeader>
        <CardContent>
          {renderStep()}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="flex gap-3 mt-6">
            {currentStep === 'welcome' ? (
              <Button
                onClick={handleNext}
                className="w-full"
              >
                Get Started
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            ) : currentStep === 'complete' ? (
              <Button
                onClick={onComplete}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                Go to Dashboard
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (currentStep === 'personal') setCurrentStep('welcome');
                    if (currentStep === 'activity') setCurrentStep('personal');
                    if (currentStep === 'goal') setCurrentStep('activity');
                  }}
                  disabled={saving}
                >
                  Back
                </Button>
                <Button
                  onClick={handleNext}
                  disabled={saving || !canProceed()}
                  className="flex-1"
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : currentStep === 'goal' ? (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Complete Setup
                    </>
                  ) : (
                    <>
                      Next
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
