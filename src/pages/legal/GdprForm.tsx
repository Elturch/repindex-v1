import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, Shield, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LegalLanguageSwitcher } from "@/components/legal/LegalLanguageSwitcher";
import { GDPR_FORM_CONTENT, type LegalLanguage } from "@/lib/legalContent";
import { supabase } from "@/integrations/supabase/client";

export default function GdprForm() {
  const [lang, setLang] = useState<LegalLanguage>('pt');
  const content = GDPR_FORM_CONTENT[lang];
  
  const [formData, setFormData] = useState({
    requestTypes: [] as string[],
    firstName: '',
    lastName: '',
    email: '',
    details: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  
  const backLabel = {
    pt: "Voltar",
    en: "Back",
    es: "Volver"
  };

  const handleRequestTypeChange = (value: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      requestTypes: checked 
        ? [...prev.requestTypes, value]
        : prev.requestTypes.filter(t => t !== value)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const { error } = await supabase.functions.invoke('send-legal-form', {
        body: {
          formType: 'gdpr',
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          details: formData.details,
          requestTypes: formData.requestTypes,
          language: lang,
        },
      });

      if (error) {
        console.error('Error submitting GDPR form:', error);
        toast.error(lang === 'pt' ? 'Erro ao enviar. Tente novamente.' : lang === 'es' ? 'Error al enviar. Inténtalo de nuevo.' : 'Error sending. Please try again.');
        setIsSubmitting(false);
        return;
      }

      setIsSubmitted(true);
      toast.success(content.success);
    } catch (err) {
      console.error('Error submitting GDPR form:', err);
      toast.error(lang === 'pt' ? 'Erro ao enviar. Tente novamente.' : lang === 'es' ? 'Error al enviar. Inténtalo de nuevo.' : 'Error sending. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-md"
        >
          <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">{content.success}</h2>
          <Button asChild className="mt-4">
            <Link to="/">{backLabel[lang]}</Link>
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{content.title} | RepIndex</title>
        <meta name="robots" content="noindex, nofollow" />
        <html lang={lang} />
      </Helmet>
      
      <div className="min-h-screen bg-background">
        <div className="container mx-auto max-w-2xl px-4 py-8 md:py-12">
          {/* Header */}
          <div className="mb-8">
            <Button variant="ghost" size="sm" asChild className="mb-4">
              <Link to="/">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {backLabel[lang]}
              </Link>
            </Button>
            
            <LegalLanguageSwitcher 
              currentLang={lang} 
              onLanguageChange={setLang} 
            />
            
            <div className="flex items-center gap-3 mb-4">
              <Shield className="h-8 w-8 text-primary" />
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                {content.title}
              </h1>
            </div>
            
            <p className="text-sm text-muted-foreground leading-relaxed">
              {content.intro}
            </p>
          </div>
          
          {/* Form */}
          <motion.form 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={handleSubmit}
            className="space-y-6"
          >
            {/* Request Types */}
            <div className="space-y-3">
              <Label className="text-base font-medium">
                {content.fields.requestType}
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {content.requestTypes.map((type) => (
                  <div key={type.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={type.value}
                      checked={formData.requestTypes.includes(type.value)}
                      onCheckedChange={(checked) => 
                        handleRequestTypeChange(type.value, checked as boolean)
                      }
                    />
                    <Label htmlFor={type.value} className="text-sm cursor-pointer">
                      {type.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Name Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">{content.fields.firstName} *</Label>
                <Input
                  id="firstName"
                  required
                  value={formData.firstName}
                  onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">{content.fields.lastName} *</Label>
                <Input
                  id="lastName"
                  required
                  value={formData.lastName}
                  onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                />
              </div>
            </div>
            
            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">{content.fields.email} *</Label>
              <Input
                id="email"
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              />
            </div>
            
            {/* Details */}
            <div className="space-y-2">
              <Label htmlFor="details">{content.fields.details} *</Label>
              <Textarea
                id="details"
                required
                rows={5}
                value={formData.details}
                onChange={(e) => setFormData(prev => ({ ...prev, details: e.target.value }))}
              />
            </div>
            
            {/* Submit */}
            <Button 
              type="submit" 
              className="w-full"
              disabled={isSubmitting || formData.requestTypes.length === 0}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {lang === 'pt' ? 'Enviando...' : lang === 'es' ? 'Enviando...' : 'Sending...'}
                </>
              ) : content.submit}
            </Button>
          </motion.form>
          
          {/* Footer */}
          <div className="mt-12 pt-8 border-t border-border">
            <p className="text-sm text-muted-foreground text-center">
              © 2025 Reputation Index, Lda. (CIF 519 229 185)
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
