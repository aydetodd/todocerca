import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAISES_HISPANOAMERICA } from "@/data/paises-hispanoamerica";

interface Country {
  code: string;
  flag: string;
  name: string;
  digits: number;
  key: string;
}

// Convertir países de Hispanoamérica + agregar USA y Canadá
const countries: Country[] = [
  ...PAISES_HISPANOAMERICA.map(p => ({
    code: p.codigoTelefono,
    flag: p.bandera,
    name: p.nombre,
    digits: p.digitos,
    key: p.codigo.toLowerCase(),
  })),
  { code: "+1", flag: "🇺🇸", name: "Estados Unidos", digits: 10, key: "us" },
  { code: "+1", flag: "🇨🇦", name: "Canadá", digits: 10, key: "ca" },
  { code: "+34", flag: "🇪🇸", name: "España", digits: 9, key: "es" },
];

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
  placeholder?: string;
  id?: string;
}

export function PhoneInput({ 
  value, 
  onChange, 
  label = "Número de teléfono",
  required = false,
  placeholder = "5512345678",
  id = "telefono"
}: PhoneInputProps) {
  // Extract country code and phone number from value
  const getCountryAndNumber = (phoneValue: string) => {
    if (!phoneValue) return { countryKey: "mx", number: "" };
    
    // Try to match country codes (longest first)
    const sortedCountries = [...countries].sort((a, b) => b.code.length - a.code.length);
    
    for (const country of sortedCountries) {
      if (phoneValue.startsWith(country.code)) {
        return {
          countryKey: country.key,
          number: phoneValue.substring(country.code.length)
        };
      }
    }
    
    // If no country code found, assume it's just a number with Mexico
    return { countryKey: "mx", number: phoneValue };
  };

  const { countryKey, number } = getCountryAndNumber(value);
  const [selectedCountryKey, setSelectedCountryKey] = useState(countryKey);
  const [phoneNumber, setPhoneNumber] = useState(number);

  const selectedCountryData = countries.find(c => c.key === selectedCountryKey);

  const handleCountryChange = (newCountryKey: string) => {
    setSelectedCountryKey(newCountryKey);
    const country = countries.find(c => c.key === newCountryKey);
    if (country) {
      onChange(`${country.code}${phoneNumber}`);
    }
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newNumber = e.target.value.replace(/[^\d]/g, ''); // Only digits
    const maxDigits = selectedCountryData?.digits || 10;
    
    // Limit to max digits for the country
    const limitedNumber = newNumber.slice(0, maxDigits);
    setPhoneNumber(limitedNumber);
    
    const country = countries.find(c => c.key === selectedCountryKey);
    if (country) {
      onChange(`${country.code}${limitedNumber}`);
    }
  };

  return (
    <div>
      {label && (
        <Label htmlFor={id}>
          {label} {required && "*"}
        </Label>
      )}
      <div className="flex gap-2">
        <Select value={selectedCountryKey} onValueChange={handleCountryChange}>
          <SelectTrigger className="w-[160px]">
            <SelectValue>
              {selectedCountryData && (
                <span className="flex items-center gap-1">
                  <span className="text-xl">{selectedCountryData.flag}</span>
                  <span>{selectedCountryData.code}</span>
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            {countries.map((country) => (
              <SelectItem key={country.key} value={country.key}>
                <span className="flex items-center gap-2">
                  <span className="text-xl">{country.flag}</span>
                  <span>{country.name} ({country.code})</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          id={id}
          type="tel"
          value={phoneNumber}
          onChange={handleNumberChange}
          placeholder={placeholder}
          required={required}
          className="flex-1 text-base font-semibold"
        />
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        {selectedCountryData?.name}: {selectedCountryData?.digits} dígitos
      </p>
    </div>
  );
}
