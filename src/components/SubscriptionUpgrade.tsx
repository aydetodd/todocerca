import React, { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowUp, Check, Loader2, Sparkles } from 'lucide-react';

type PlanType = 'basico' | 'plan100' | 'plan500';

interface PlanInfo {
  id: PlanType;
  name: string;
  price: number;
  maxProducts: number;
  description: string;
}

const PLANS: PlanInfo[] = [
  {
    id: 'basico',
    name: 'Plan Básico',
    price: 200,
    maxProducts: 10,
    description: 'Ideal para negocios pequeños'
  },
  {
    id: 'plan100',
    name: 'Plan 100',
    price: 300,
    maxProducts: 100,
    description: 'Para negocios medianos'
  },
  {
    id: 'plan500',
    name: 'Plan 500',
    price: 400,
    maxProducts: 500,
    description: 'Para negocios grandes'
  }
];

interface SubscriptionUpgradeProps {
  currentPlanType?: PlanType;
  onUpgradeComplete?: () => void;
}

export default function SubscriptionUpgrade({ 
  currentPlanType = 'basico',
  onUpgradeComplete 
}: SubscriptionUpgradeProps) {
  const [loading, setLoading] = useState<PlanType | null>(null);
  const { toast } = useToast();

  const currentPlan = PLANS.find(p => p.id === currentPlanType) || PLANS[0];
  const currentPlanIndex = PLANS.findIndex(p => p.id === currentPlanType);

  // Get available upgrade options (only plans more expensive than current)
  const upgradeOptions = PLANS.filter(plan => plan.price > currentPlan.price);

  const calculateUpgradeCost = (targetPlan: PlanInfo): number => {
    return targetPlan.price - currentPlan.price;
  };

  const handleUpgrade = async (targetPlan: PlanInfo) => {
    setLoading(targetPlan.id);
    
    try {
      const { data, error } = await supabase.functions.invoke('upgrade-subscription', {
        body: { newPlanType: targetPlan.id }
      });

      if (error) {
        throw new Error(error.message || 'Error al actualizar suscripción');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      toast({
        title: "¡Actualización exitosa!",
        description: `Tu plan ahora es ${targetPlan.name}. Puedes agregar hasta ${targetPlan.maxProducts} productos.`,
      });

      onUpgradeComplete?.();
    } catch (error: any) {
      console.error('Upgrade error:', error);
      toast({
        title: "Error al actualizar",
        description: error.message || 'No se pudo actualizar tu plan',
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  if (upgradeOptions.length === 0) {
    return (
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            ¡Tienes el mejor plan!
          </CardTitle>
          <CardDescription>
            Ya cuentas con el Plan 500 que incluye hasta 500 productos.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Current Plan */}
      <Card className="border-primary bg-primary/5">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Tu plan actual</CardTitle>
            <Badge variant="default">{currentPlan.name}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold">${currentPlan.price} MXN<span className="text-sm font-normal text-muted-foreground">/año</span></p>
              <p className="text-sm text-muted-foreground">Hasta {currentPlan.maxProducts} productos</p>
            </div>
            <Check className="h-6 w-6 text-primary" />
          </div>
        </CardContent>
      </Card>

      {/* Upgrade Options */}
      <div className="space-y-3">
        <h3 className="font-semibold flex items-center gap-2">
          <ArrowUp className="h-4 w-4" />
          Opciones de actualización
        </h3>
        
        {upgradeOptions.map((plan) => {
          const upgradeCost = calculateUpgradeCost(plan);
          const isLoading = loading === plan.id;
          
          return (
            <Card 
              key={plan.id} 
              className="hover:border-primary/50 transition-colors"
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold">{plan.name}</h4>
                      <Badge variant="secondary" className="text-xs">
                        +{plan.maxProducts - currentPlan.maxProducts} productos
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{plan.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Hasta {plan.maxProducts} productos • ${plan.price} MXN/año
                    </p>
                  </div>
                  
                  <div className="text-right">
                    <p className="text-lg font-bold text-primary">
                      +${upgradeCost} MXN
                    </p>
                    <p className="text-xs text-muted-foreground mb-2">
                      pago único
                    </p>
                    <Button 
                      size="sm"
                      onClick={() => handleUpgrade(plan)}
                      disabled={loading !== null}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          Actualizando...
                        </>
                      ) : (
                        <>
                          <ArrowUp className="h-4 w-4 mr-1" />
                          Actualizar
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        💳 Se cobrará la diferencia prorrateada a tu método de pago registrado.
      </p>
    </div>
  );
}
