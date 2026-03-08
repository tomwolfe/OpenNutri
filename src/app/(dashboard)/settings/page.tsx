'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
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
import { Loader2, Save, User, Activity, Ruler, Scale, Calendar, Key, Shield } from 'lucide-react';
import { ACTIVITY_LEVELS, GENDERS } from '@/lib/tdee';
import { RecoveryKitDialog } from '@/components/recovery-kit-dialog';
import { SyncStatusCard } from '@/components/sync-status-card';

interface UserProfile {
  id: string;
  email: string | null;
  birthDate: string | null;
  gender: string | null;
  heightCm: number | null;
  activityLevel: string | null;
  weightGoal: string; // lose, maintain, gain
}

interface TDEEResult {
  bmr: number;
  tdee: number;
  calorieTargets: {
    lose: number;
    maintain: number;
    gain: number;
  };
}

interface ProfileResponse {
  profile: UserProfile;
  latestWeight: number | null;
  tdee: TDEEResult | null;
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [recoveryDialogOpen, setRecoveryDialogOpen] = useState(false);
  const [hasRecoveryKey, setHasRecoveryKey] = useState(false);
  
  const [profile, setProfile] = useState<UserProfile>({
    id: '',
    email: null,
    birthDate: null,
    gender: null,
    heightCm: null,
    activityLevel: null,
    weightGoal: 'maintain',
  });

  const [tdee, setTdee] = useState<TDEEResult | null>(null);
  const [latestWeight, setLatestWeight] = useState<number | null>(null);

  // Fetch profile on mount
  useEffect(() => {
    fetchProfile();
    checkRecoveryKeyStatus();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/profile');

      if (!response.ok) {
        throw new Error('Failed to fetch profile');
      }

      const data: ProfileResponse = await response.json();
      setProfile(data.profile);
      setLatestWeight(data.latestWeight);
      setTdee(data.tdee);
    } catch {
      setMessage({ type: 'error', text: 'Failed to load profile' });
    } finally {
      setLoading(false);
    }
  };

  const checkRecoveryKeyStatus = async () => {
    try {
      const response = await fetch('/api/auth/keys');
      if (response.ok) {
        const data = await response.json();
        setHasRecoveryKey(!!data?.recoveryKeySalt);
      }
    } catch (error) {
      console.error('Failed to check recovery key status:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          birthDate: profile.birthDate || undefined,
          gender: profile.gender || undefined,
          heightCm: profile.heightCm || undefined,
          activityLevel: profile.activityLevel || undefined,
          weightGoal: profile.weightGoal,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save profile');
      }

      setProfile(data.profile);
      setTdee(data.tdee);
      setMessage({ type: 'success', text: 'Profile saved successfully! Your calorie targets have been updated.' });
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Failed to save profile' 
      });
    } finally {
      setSaving(false);
    }
  };

  const getCalorieTargetForGoal = () => {
    if (!tdee) return null;
    return tdee.calorieTargets[profile.weightGoal as 'lose' | 'maintain' | 'gain'];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your profile and nutrition targets
        </p>
      </div>

      {message && (
        <div
          className={`p-4 rounded-lg border ${
            message.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Sync Status - Full width on medium+ */}
        <div className="md:col-span-2">
          <SyncStatusCard />
        </div>

        {/* Profile Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Personal Information
            </CardTitle>
            <CardDescription>
              Enter your details to calculate personalized calorie targets
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={profile.email || ''}
                  disabled
                  className="bg-muted"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="birthDate" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Birth Date
                </Label>
                <Input
                  id="birthDate"
                  type="date"
                  value={profile.birthDate || ''}
                  onChange={(e) => setProfile({ ...profile, birthDate: e.target.value })}
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="gender" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Gender
                </Label>
                <Select
                  value={profile.gender || ''}
                  onValueChange={(value) => setProfile({ ...profile, gender: value })}
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
                <Label htmlFor="heightCm" className="flex items-center gap-2">
                  <Ruler className="h-4 w-4" />
                  Height (cm)
                </Label>
                <Input
                  id="heightCm"
                  type="number"
                  min="50"
                  max="300"
                  placeholder="e.g., 175"
                  value={profile.heightCm || ''}
                  onChange={(e) => setProfile({ ...profile, heightCm: parseInt(e.target.value) || null })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="activityLevel" className="flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Activity Level
                </Label>
                <Select
                  value={profile.activityLevel || ''}
                  onValueChange={(value) => setProfile({ ...profile, activityLevel: value })}
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

              <div className="space-y-2">
                <Label htmlFor="weightGoal" className="flex items-center gap-2">
                  <Scale className="h-4 w-4" />
                  Weight Goal
                </Label>
                <Select
                  value={profile.weightGoal || 'maintain'}
                  onValueChange={(value) => {
                    if (value) setProfile({ ...profile, weightGoal: value });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lose">Lose Weight</SelectItem>
                    <SelectItem value="maintain">Maintain Weight</SelectItem>
                    <SelectItem value="gain">Gain Weight</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Profile
                  </>
                )}
              </Button>
            </CardContent>
          </form>
        </Card>

        {/* TDEE & Targets Display */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5" />
              Your Nutrition Targets
            </CardTitle>
            <CardDescription>
              Based on your profile and latest weight
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {latestWeight ? (
              <>
                <div className="p-3 bg-muted rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Latest Weight</span>
                    <span className="text-lg font-semibold">{latestWeight.toFixed(1)} kg</span>
                  </div>
                </div>

                {tdee ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="text-xs text-blue-700">BMR</div>
                        <div className="text-xl font-bold text-blue-900">{tdee.bmr}</div>
                        <div className="text-xs text-blue-600">calories/day</div>
                      </div>
                      <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                        <div className="text-xs text-green-700">TDEE</div>
                        <div className="text-xl font-bold text-green-900">{tdee.tdee}</div>
                        <div className="text-xs text-green-600">calories/day</div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">Calorie Targets by Goal:</h4>
                      
                      <div className={`p-3 rounded-lg border ${
                        profile.weightGoal === 'lose' ? 'bg-amber-50 border-amber-200' : 'bg-muted'
                      }`}>
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Weight Loss</span>
                          <span className="font-semibold text-amber-700">{tdee.calorieTargets.lose} cal</span>
                        </div>
                        <div className="text-xs text-amber-600">-500 cal/day deficit</div>
                      </div>

                      <div className={`p-3 rounded-lg border ${
                        profile.weightGoal === 'maintain' ? 'bg-green-50 border-green-200' : 'bg-muted'
                      }`}>
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Maintenance</span>
                          <span className="font-semibold text-green-700">{tdee.calorieTargets.maintain} cal</span>
                        </div>
                        <div className="text-xs text-green-600">Maintain current weight</div>
                      </div>

                      <div className={`p-3 rounded-lg border ${
                        profile.weightGoal === 'gain' ? 'bg-blue-50 border-blue-200' : 'bg-muted'
                      }`}>
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Weight Gain</span>
                          <span className="font-semibold text-blue-700">{tdee.calorieTargets.gain} cal</span>
                        </div>
                        <div className="text-xs text-blue-600">+500 cal/day surplus</div>
                      </div>
                    </div>

                    {getCalorieTargetForGoal() && (
                      <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
                        <div className="text-sm text-muted-foreground">Your Current Target</div>
                        <div className="text-2xl font-bold text-primary">
                          {getCalorieTargetForGoal()} calories/day
                        </div>
                        <div className="text-xs text-muted-foreground capitalize">
                          for {profile.weightGoal}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-800">
                      <strong>Complete your profile</strong> to see personalized calorie targets.
                    </p>
                    <p className="text-xs text-amber-600 mt-1">
                      Fill in all fields above and record your weight in the Weight Tracker.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-800">
                  <strong>No weight recorded yet</strong>
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  Track your weight in the dashboard to calculate your TDEE and personalized calorie targets.
                </p>
              </div>
            )}

            <div className="text-xs text-muted-foreground pt-4 border-t">
              <p>
                <strong>Note:</strong> Calculations use the Mifflin-St Jeor Equation,
                considered the most accurate for the general population.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Security & Recovery */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security & Recovery
          </CardTitle>
          <CardDescription>
            Protect your encrypted data with a recovery key
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="font-semibold text-blue-900 mb-2">Why You Need a Recovery Key</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Your data is encrypted end-to-end with your password</li>
              <li>• If you forget your password, the ONLY way to recover your data is with your recovery key</li>
              <li>• The recovery key consists of 24 words that you must store securely</li>
              <li>• Without it, your data is permanently lost if you forget your password</li>
            </ul>
          </div>

          {hasRecoveryKey ? (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-start gap-3">
                <Key className="h-5 w-5 text-green-600 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-green-900">Recovery Key Active</h4>
                  <p className="text-sm text-green-700 mt-1">
                    You have already generated a recovery key. Make sure you&apos;ve stored it in a secure location.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-amber-600 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-amber-900">No Recovery Key</h4>
                  <p className="text-sm text-amber-700 mt-1">
                    You haven&apos;t generated a recovery key yet. Your data is at risk if you forget your password.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              onClick={() => setRecoveryDialogOpen(true)}
              className="flex-1"
              variant={hasRecoveryKey ? 'outline' : 'default'}
            >
              <Key className="h-4 w-4 mr-2" />
              {hasRecoveryKey ? 'View/Regenerate Recovery Key' : 'Generate Recovery Key'}
            </Button>
            {hasRecoveryKey && (
              <Button
                onClick={async () => {
                  if (confirm('Are you sure you want to revoke your recovery key? Your old mnemonics will no longer work.')) {
                    try {
                      const response = await fetch('/api/auth/recovery-key/revoke', {
                        method: 'POST',
                      });
                      if (response.ok) {
                        setHasRecoveryKey(false);
                        setMessage({ type: 'success', text: 'Recovery key revoked successfully' });
                      }
                    } catch (_error) {
                      setMessage({ type: 'error', text: 'Failed to revoke recovery key' });
                    }
                  }
                }}
                variant="destructive"
              >
                Revoke
              </Button>
            )}
          </div>

          <div className="text-xs text-muted-foreground pt-4 border-t">
            <p>
              <strong>Important:</strong> Store your 24 recovery words offline (write them down or save in a password manager).
              Anyone with these words can access your data.
            </p>
          </div>
        </CardContent>
      </Card>

      <RecoveryKitDialog
        open={recoveryDialogOpen}
        onOpenChange={setRecoveryDialogOpen}
        onGenerateComplete={() => {
          setHasRecoveryKey(true);
          setMessage({ type: 'success', text: 'Recovery key generated successfully!' });
        }}
      />
    </div>
  );
}
