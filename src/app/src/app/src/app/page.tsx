'use client';

import Header from '@/components/header';
import Footer from '@/components/footer';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Medal, CalendarClock, ShieldQuestion, Heart, ListChecks, Swords, IndianRupee } from 'lucide-react';
import WelcomeHandler from '@/components/welcome-handler';
import RegistrationCounter from '@/components/registration-counter';
import RegistrationForm from '@/components/registration-form';


function HomePageContent() {
  return (
    <div className="flex flex-col min-h-dvh">
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-4xl mx-auto space-y-12">
          <RegistrationCounter />
          <RegistrationForm />
          
          <div className="space-y-8">
            <h2 className="text-3xl font-bold text-center text-primary glow">Tournament Details</h2>
            <div className="grid md:grid-cols-2 gap-8">
              <Card className="interactive-card">
                <CardHeader className="flex flex-row items-center gap-3">
                  <ListChecks className="w-8 h-8 text-accent" />
                  <CardTitle className="text-accent">How to Join</CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="space-y-3 list-decimal list-inside text-muted-foreground">
                    <li>Fill out the complete registration form with your team details.</li>
                    <li>Pay the entry fee of ₹100 using the provided UPI ID or QR code.</li>
                    <li>Enter the UTR number from your payment in the form.</li>
                    <li>After successful registration, join the official WhatsApp group for all match schedules and updates.</li>
                  </ol>
                </CardContent>
              </Card>

              <Card className="interactive-card">
                <CardHeader className="flex flex-row items-center gap-3">
                  <Medal className="w-8 h-8 text-accent" />
                  <CardTitle className="text-accent">Prizes &amp; Entry</CardTitle>
                </CardHeader>
                <CardContent>
                   <ul className="space-y-2 list-disc list-inside text-muted-foreground">
                    <li><span className="font-semibold text-foreground/90">Entry Fee:</span> ₹100 per team</li>
                    <li><span className="font-semibold text-foreground/90">1st Place Prize:</span> ₹750</li>
                    <li><span className="font-semibold text-foreground/90">2nd Place Prize:</span> ₹120</li>
                    <li className='pt-2'><IndianRupee className="inline-block w-4 h-4 mr-1"/>Prizes are sent via UPI within 24 hours of winner announcement.</li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="interactive-card">
                <CardHeader className="flex flex-row items-center gap-3">
                  <Swords className="w-8 h-8 text-accent" />
                  <CardTitle className="text-accent">Match Format</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 list-disc list-inside text-muted-foreground">
                      <li><span className="font-semibold text-foreground/90">Mode:</span> Battle royale</li>
                      <li><span className="font-semibold text-foreground/90">Map:</span> Barmuda</li>
                      <li><span className="font-semibold text-foreground/90">Team:</span> Squad</li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="interactive-card">
                <CardHeader className="flex flex-row items-center gap-3">
                  <ShieldQuestion className="w-8 h-8 text-accent" />
                  <CardTitle className="text-accent">Fair Play Rules</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 list-disc list-inside text-muted-foreground">
                    <li>No hacking, cheating, or use of third-party tools.</li>
                    <li>Use of panel or any configuration file is strictly prohibited.</li>
                    <li>No teaming up with opponent teams.</li>
                    <li>Abusive language towards players or admins will lead to a ban.</li>
                    <li>Any player found breaking rules will result in disqualification of the entire team.</li>
                  </ul>
                </CardContent>
              </Card>
              
              <Card className="interactive-card">
                <CardHeader className="flex flex-row items-center gap-3">
                  <CalendarClock className="w-8 h-8 text-accent" />
                  <CardTitle className="text-accent">Tournament Schedule</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-muted-foreground">
                    <li><span className="font-semibold text-foreground/90">Registration:</span> Monday (12:30 AM) to Sunday (10:00 PM)</li>
                    <li><span className="font-semibold text-foreground/90">Match Day:</span> Every Sunday</li>
                    <li><span className="font-semibold text-foreground/90">Room ID & Pass:</span> Sent at 08:25 PM in the WhatsApp group</li>
                    <li><span className="font-semibold text-foreground/90">Match Start Time:</span> 08:35 PM sharp</li>
                  </ul>
                </CardContent>
              </Card>

               <Card className="interactive-card">
                <CardHeader className="flex flex-row items-center gap-3">
                  <Heart className="w-8 h-8 text-accent" />
                  <CardTitle className="text-accent">Our Motivation</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground italic">
                    “Play with passion, fight with honor, and let your skills speak louder than words. The Founders Official is your stage to shine!”
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
      <Separator />
      <Footer />
    </div>
  );
}


export default function Home() {
  return (
    <WelcomeHandler>
      <HomePageContent />
    </WelcomeHandler>
  );
      }
