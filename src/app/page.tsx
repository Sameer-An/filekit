import React from 'react';
import { HeroSection } from '@/components/sections/hero-section';
import { PopularToolsSection } from '@/components/sections/popular-tools-section';
import { HowItWorksSection } from '@/components/sections/how-it-works-section';
import { PrivacySection } from '@/components/sections/privacy-section';
import { FaqSection } from '@/components/sections/faq-section';
import { AllCategoriesSection } from '@/components/sections/all-categories-section';

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <PopularToolsSection />
      <AllCategoriesSection />
      <HowItWorksSection />
      <PrivacySection />
      <FaqSection />
    </>
  );
}
