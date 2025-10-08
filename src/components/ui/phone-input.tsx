import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Country {
  code: string;
  flag: string;
  name: string;
  digits: number;
}

const countries: Country[] = [
  { code: "+52", flag: "🇲🇽", name: "México", digits: 10 },
  { code: "+1", flag: "🇺🇸", name: "Estados Unidos", digits: 10 },
  { code: "+1", flag: "🇨🇦", name: "Canadá", digits: 10 },
  { code: "+34", flag: "🇪🇸", name: "España", digits: 9 },
  { code: "+54", flag: "🇦🇷", name: "Argentina", digits: 10 },
  { code: "+57", flag: "🇨🇴", name: "Colombia", digits: 10 },
  { code: "+56", flag: "🇨🇱", name: "Chile", digits: 9 },
  { code: "+51", flag: "🇵🇪", name: "Perú", digits: 9 },
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
    if (!phoneValue) return { countryCode: "+52", number: "" };
    
    for (const country of countries) {
      if (phoneValue.startsWith(country.code)) {
        return {
          countryCode: country.code,
          number: phoneValue.substring(country.code.length)
        };
      }
    }
    
    // If no country code found, assume it's just a number
    return { countryCode: "+52", number: phoneValue };
  };

  const { countryCode, number } = getCountryAndNumber(value);
  const [selectedCountry, setSelectedCountry] = useState(countryCode);
  const [phoneNumber, setPhoneNumber] = useState(number);

  const handleCountryChange = (newCountryCode: string) => {
    setSelectedCountry(newCountryCode);
    onChange(`${newCountryCode}${phoneNumber}`);
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newNumber = e.target.value.replace(/[^\d]/g, ''); // Only digits
    const selectedCountryData = countries.find(c => c.code === selectedCountry);
    const maxDigits = selectedCountryData?.digits || 10;
    
    // Limit to max digits for the country
    const limitedNumber = newNumber.slice(0, maxDigits);
    setPhoneNumber(limitedNumber);
    onChange(`${selectedCountry}${limitedNumber}`);
  };

  const selectedCountryData = countries.find(c => c.code === selectedCountry);

  return (
    <div>
      {label && (
        <Label htmlFor={id}>
          {label} {required && "*"}
        </Label>
      )}
      <div className="flex gap-2">
        <Select value={selectedCountry} onValueChange={handleCountryChange}>
          <SelectTrigger className="w-[140px]">
            <SelectValue>
              <span className="flex items-center gap-2">
                <span className="text-xl">{selectedCountryData?.flag}</span>
                <span>{selectedCountry}</span>
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {countries.map((country) => (
              <SelectItem key={`${country.code}-${country.name}`} value={country.code}>
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
          className="flex-1"
        />
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        {selectedCountryData?.name}: {selectedCountryData?.digits} dígitos
      </p>
    </div>
  );
}
