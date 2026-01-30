import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, MessageSquareWarning } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LegalLanguageSwitcher } from "@/components/legal/LegalLanguageSwitcher";
import { COMPLAINTS_FORM_CONTENT, type LegalLanguage } from "@/lib/legalContent";

export default function ComplaintsForm() {
  const [lang, setLang] = useState<LegalLanguage>('pt');
  const content = COMPLAINTS_FORM_CONTENT[lang];
  
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    details: '',
    acceptTerms: false
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  
  const backLabel = {
    pt: "Voltar",
    en: "Back",
    es: "Volver"
  };
  
  const processLabel = {
    pt: "Como será tratada a sua reclamação:",
    en: "How your complaint will be handled:",
    es: "Cómo se tratará su reclamación:"
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Simulate form submission
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    setIsSubmitting(false);
    setIsSubmitted(true);
    toast.success(content.success);
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
              <MessageSquareWarning className="h-8 w-8 text-primary" />
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                {content.title}
              </h1>
            </div>
            
            <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
              {content.intro.map((paragraph, idx) => (
                <p key={idx}>{paragraph}</p>
              ))}
            </div>
          </div>
          
          {/* Process Steps */}
          <div className="mb-8 p-4 bg-muted/50 rounded-lg">
            <h3 className="font-semibold mb-3">{processLabel[lang]}</h3>
            <ol className="space-y-2 text-sm text-muted-foreground">
              {content.process.map((step) => (
                <li key={step.step} className="flex gap-2">
                  <span className="font-medium text-foreground">{step.step}.</span>
                  <span>{step.text}</span>
                </li>
              ))}
            </ol>
          </div>
          
          {/* Form */}
          <motion.form 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={handleSubmit}
            className="space-y-6"
          >
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
            
            {/* Contact Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <div className="space-y-2">
                <Label htmlFor="phone">{content.fields.phone}</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                />
              </div>
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
            
            {/* Terms Checkbox */}
            <div className="flex items-start space-x-2">
              <Checkbox
                id="acceptTerms"
                checked={formData.acceptTerms}
                onCheckedChange={(checked) => 
                  setFormData(prev => ({ ...prev, acceptTerms: checked as boolean }))
                }
              />
              <Label htmlFor="acceptTerms" className="text-sm cursor-pointer leading-relaxed">
                {content.termsLabel.split('"Termos e Condições"')[0]}
                <Link to="/termos" className="text-primary hover:underline">
                  "Termos e Condições"
                </Link>
                {content.termsLabel.split('"Termos e Condições"')[1]}
              </Label>
            </div>
            
            {/* Submit */}
            <Button 
              type="submit" 
              className="w-full"
              disabled={isSubmitting || !formData.acceptTerms}
            >
              {isSubmitting ? "..." : content.submit}
            </Button>
          </motion.form>
          
          {/* Footer */}
          <div className="mt-12 pt-8 border-t border-border">
            <p className="text-sm text-muted-foreground text-center">
              © 2025 Reputation Index, Lda. (NIF 519 229 185)
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
