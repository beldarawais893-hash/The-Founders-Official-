'use server';

import { promises as fs } from 'fs';
import path from 'path';
import { Resend } from 'resend';
import { z } from 'zod';
import { uploadFileToStorage } from '@/services/storage';
import { verifyUtrFromScreenshot, VerifyUtrOutput } from '@/ai/flows/verify-payment-flow';
import crypto from 'crypto';


// --- Type Definitions ---

type Player = {
  id: string;
  level: number;
};

export type TeamRegistrationData = {
  teamName: string;
  players: Player[];
  contactEmail: string;
  contactPhone: string;
  utrNumber: string;
  screenshotHash: string; // To prevent duplicate screenshot submissions
  registrationTime: string; // ISO string
};


type RegistrationState = {
  registrationWeekStart: string; // ISO string for the start of the week (Monday)
  registeredTeamsCount: number;
};

export type WeeklyData = {
    registrationWeekStart: string;
    teams: TeamRegistrationData[];
}

type WinnerInfo = {
    rank: '1st' | '2nd';
    teamName: string;
}

export type WeeklyWinner = {
    weekStart: string; // ISO String
    winners: WinnerInfo[];
    totalTeams: number; // Added to store the count for historical balance
}


// --- Path Constants ---
const dataDir = path.join(process.cwd(), 'src', 'data');
const archiveDir = path.join(dataDir, 'archive');
const statePath = path.join(dataDir, 'registration-state.json');
const registrationsPath = path.join(dataDir, 'registrations.json');
const winnersPath = path.join(dataDir, 'winners.json');


// --- Time and Week Calculation ---

/**
 * Calculates the start of the current registration week (the most recent Monday).
 */
function getRegistrationWeekStart(now: Date): Date {
  const currentDay = now.getDay(); // Sunday is 0, Monday is 1, etc.
  const distanceToMonday = (currentDay + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - distanceToMonday);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/**
 * Checks if the current time is within the allowed registration window.
 * Window: Monday 12:30 AM to Sunday 10:00 PM
 */
function isRegistrationWindowOpen(now: Date): boolean {
    const day = now.getDay();
    const hours = now.getHours();
    const minutes = now.getMinutes();

    // If it's Sunday after 10 PM
    if (day === 0 && (hours >= 22)) {
        return false;
    }
    
    // If it's Monday before 12:30 AM
    if (day === 1 && (hours === 0 && minutes < 30)) {
        return false;
    }

    return true;
}

// --- Data Access and Management ---

/**
 * Ensures the data directory and archive directory exists.
 */
async function ensureDataDirectories() {
    try {
        await fs.access(dataDir);
    } catch {
        await fs.mkdir(dataDir, { recursive: true });
    }
     try {
        await fs.access(archiveDir);
    } catch {
        await fs.mkdir(archiveDir, { recursive: true });
    }
}


/**
 * Reads data from a JSON file.
 */
async function readJsonFile<T>(filePath: string): Promise<T | null> {
    try {
        await ensureDataDirectories();
        const fileData = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(fileData) as T;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null; // File not found, return null
        }
        throw error; // Other errors
    }
}


/**
 * Writes data to a JSON file.
 */
async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
    await ensureDataDirectories();
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}


/**
 * Sends an email notification to the admin for a new registration.
 * Includes the screenshot URL directly.
 */
async function sendNewRegistrationEmail(teamData: Omit<TeamRegistrationData, 'registrationTime' | 'screenshotHash'>, screenshotUrl: string | null) {
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const { ADMIN_EMAIL, EMAIL_USER } = process.env;

    if (!RESEND_API_KEY || !ADMIN_EMAIL || !EMAIL_USER) {
        console.warn("Admin/Resend email not configured. Skipping admin notification.");
        return; // Don't throw error, just skip.
    }
    
    const resend = new Resend(RESEND_API_KEY);
    const registrationTime = new Date().toLocaleString('en-US', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    let playersHtml = '<ul>';
    teamData.players.forEach(p => {
        playersHtml += `<li><b>ID:</b> ${p.id}, <b>Level:</b> ${p.level}</li>`;
    });
    playersHtml += '</ul>';
    
    const screenshotHtml = screenshotUrl 
        ? `<p><a href="${screenshotUrl}" target="_blank" style="font-weight: bold; color: #007bff;">View Screenshot</a></p>`
        : '<p style="font-weight: bold; color: #dc3545;">Screenshot upload failed. Please verify UTR manually.</p>';

    const verificationHtml = `<p><strong>AI Verification Result:</strong> Payment details verified successfully by AI.</p>`;

    const emailBody = `
        <h1>New Team Registration!</h1>
        <p>A new team has registered for the tournament and the payment has been successfully verified by the AI.</p>
        ${verificationHtml}
        ${screenshotHtml}
        <hr>
        <h2>Team Details:</h2>
        <ul>
            <li><strong>Team Name:</strong> ${teamData.teamName}</li>
            <li><strong>Contact Email:</strong> ${teamData.contactEmail}</li>
            <li><strong>Contact Phone:</strong> ${teamData.contactPhone}</li>
            <li><strong>UTR Number:</strong> ${teamData.utrNumber}</li>
            <li><strong>Registration Time:</strong> ${registrationTime} (IST)</li>
        </ul>
        <h3>Players:</h3>
        ${playersHtml}
        <hr>
        <p>This is an automated notification.</p>
    `;

    try {
        await resend.emails.send({
            from: `The Founders Official <${EMAIL_USER}>`,
            to: ADMIN_EMAIL,
            subject: `New Tournament Registration: ${teamData.teamName}`,
            html: emailBody,
        });
        console.log(`Registration email sent for team: ${teamData.teamName}`);
    } catch (error) {
        console.error('Error sending new registration email via Resend:', error);
        // Do not throw error to the client, just log it.
    }
}

/**
 * Sends a confirmation email to the user upon successful registration.
 */
async function sendConfirmationEmailToUser(teamData: TeamRegistrationData) {
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const { EMAIL_USER } = process.env;
    
    if (!RESEND_API_KEY || !EMAIL_USER) {
        console.warn("Email API keys not configured. Skipping confirmation email to user.");
        // Do not throw an error, just log it and continue. The registration is successful.
        return;
    }

    const resend = new Resend(RESEND_API_KEY);
    const registrationTime = new Date(teamData.registrationTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    let playersHtml = '<ul>';
    teamData.players.forEach(p => {
        playersHtml += `<li><b>ID:</b> ${p.id}, <b>Level:</b> ${p.level}</li>`;
    });
    playersHtml += '</ul>';

    const emailBody = `
        <h1>Registration Confirmed!</h1>
        <p>Hello ${teamData.teamName},</p>
        <p>Thank you for registering for The Founders Official tournament. Your registration has been received.</p>
        <hr>
        <h2>Your Registration Details:</h2>
        <ul>
            <li><strong>Team Name:</strong> ${teamData.teamName}</li>
            <li><strong>UTR Number:</strong> ${teamData.utrNumber}</li>
            <li><strong>Registration Time:</strong> ${registrationTime} (IST)</li>
        </ul>
        <h3>Your Players:</h3>
        ${playersHtml}
        <hr>
        <p>Your payment and registration details have been verified. Please join the WhatsApp group for match updates.</p>
        <p>Good luck!</p>
        <br>
        <p>Best regards,<br>The Founders Official</p>
    `;

    try {
        await resend.emails.send({
            from: `"The Founders Official" <${EMAIL_USER}>`,
            to: teamData.contactEmail,
            subject: `Registration Confirmation for The Founders Tournament`,
            html: emailBody,
        });
        console.log(`Confirmation email sent to user for team: ${teamData.teamName}`);
    } catch (error) {
        console.error('Error sending confirmation email to user via Resend:', error);
        // Do not throw, as the main registration was successful
    }
}


/**
 * Archives the weekly registration file.
 */
async function archiveWeeklyData(weeklyData: WeeklyData) {
    if (!weeklyData || weeklyData.teams.length === 0) {
        console.log("No data to archive for the completed week.");
        return;
    }
    
    const weekStartDate = new Date(weeklyData.registrationWeekStart);
    // Format as YYYY-MM-DD
    const dateString = weekStartDate.toISOString().split('T')[0];
    const archivePath = path.join(archiveDir, `registrations-${dateString}.json`);

    try {
        await writeJsonFile(archivePath, weeklyData);
        console.log(`Successfully archived weekly data to ${archivePath}`);
    } catch (error) {
        console.error(`Failed to archive weekly data for ${dateString}:`, error);
    }
}


/**
 * Reads the current weekly data and registration state, handling weekly resets and reports.
 * This is the primary function for getting current status.
 */
async function manageWeeklyState(): Promise<{ state: RegistrationState; weeklyData: WeeklyData }> {
    const now = new Date();
    const currentWeekStart = getRegistrationWeekStart(now);

    let state = await readJsonFile<RegistrationState>(statePath);
    let weeklyData = await readJsonFile<WeeklyData>(registrationsPath);

    // If state or weeklyData doesn't exist, create them for the current week.
    if (!state || !weeklyData) {
        const newState: RegistrationState = {
            registrationWeekStart: currentWeekStart.toISOString(),
            registeredTeamsCount: 0,
        };
        const newWeeklyData: WeeklyData = {
            registrationWeekStart: currentWeekStart.toISOString(),
            teams: [],
        };
        await writeJsonFile(statePath, newState);
        await writeJsonFile(registrationsPath, newWeeklyData);
        return { state: newState, weeklyData: newWeeklyData };
    }

    // Check if a new week has started.
    const isNewWeek = new Date(state.registrationWeekStart).getTime() < currentWeekStart.getTime();

    if (isNewWeek) {
        // A new week has begun. Archive the old data, then reset.
        await archiveWeeklyData(weeklyData);

        // Reset state and weekly data for the new week.
        const newState: RegistrationState = {
            registrationWeekStart: currentWeekStart.toISOString(),
            registeredTeamsCount: 0,
        };
        const newWeeklyData: WeeklyData = {
            registrationWeekStart: currentWeekStart.toISOString(),
            teams: [],
        };

        await writeJsonFile(statePath, newState);
        await writeJsonFile(registrationsPath, newWeeklyData);

        return { state: newState, weeklyData: newWeeklyData };
    }

    // It's the same week, return the current data.
    // Ensure data consistency
    if(state.registeredTeamsCount !== weeklyData.teams.length){
        state.registeredTeamsCount = weeklyData.teams.length;
        await writeJsonFile(statePath, state);
    }

    return { state, weeklyData };
}

// --- Public Server Actions ---

/**
 * Gets the current registration status (slots filled, total slots, and if open).
 */
export async function getRegistrationStatus() {
  const { state } = await manageWeeklyState();
  const now = new Date();
  const totalSlots = 12;

  const isWindowOpen = isRegistrationWindowOpen(now);
  const areSlotsAvailable = state.registeredTeamsCount < totalSlots;

  return {
    slotsFilled: state.registeredTeamsCount,
    totalSlots: totalSlots,
    isOpen: isWindowOpen && areSlotsAvailable,
    weekStart: state.registrationWeekStart,
  };
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

const playerSchema = z.object({
  id: z.string().min(1, "Player ID is required.").max(30, "Player ID must be 30 characters or less."),
  level: z.coerce.number().min(30, "Player level must be 30 or above.").max(100, "Invalid level."),
});

const registrationSchema = z.object({
  teamName: z.string().min(1, "Team Name is required.").max(30, "Team Name must be 30 characters or less."),
  players: z.array(playerSchema).length(4),
  contactEmail: z.string().email("Invalid email address."),
  contactPhone: z.string().regex(/^[0-9]{10}$/, "Must be a valid 10-digit phone number."),
  utrNumber: z.string().min(5, "UTR number must be at least 5 characters.").max(30, "UTR number must be 30 characters or less."),
  screenshot: z
    .instanceof(File, { message: "Screenshot is required." })
    .refine((file) => file.size > 0, "Screenshot is required.")
    .refine((file) => file.size <= MAX_FILE_SIZE, `Max file size is 10MB.`)
    .refine(
      (file) => ACCEPTED_IMAGE_TYPES.includes(file.type),
      "Only .jpg, .jpeg, .png and .webp formats are supported."
    ),
});


async function runAIVerification(screenshot: File, utrNumber: string): Promise<VerifyUtrOutput> {
    try {
        const screenshotBuffer = Buffer.from(await screenshot.arrayBuffer());
        const screenshotDataUri = `data:${screenshot.type};base64,${screenshotBuffer.toString('base64')}`;
        return await verifyUtrFromScreenshot({
            screenshotDataUri,
            utr: utrNumber,
        });
    } catch (error) {
        console.error("Critical: AI verification process failed.", error);
        return {
            isUtrMatch: false,
            reason: "AI verification service is currently unavailable. Please try again later.",
        };
    }
}


/**
 * The main server action to register a team.
 * Accepts form data and processes the registration.
 */
export async function registerTeam(formData: FormData) {
  try {
      // 1. Check Registration Status
      const { state, weeklyData } = await manageWeeklyState();
      const status = await getRegistrationStatus();
      if (!status.isOpen) {
        return {
          success: false,
          error: 'Registrations are currently closed. Please check back next week.',
        };
      }
      
      // 2. Parse and Validate Form Data
      const rawData = Object.fromEntries(formData.entries());
      const players = [
        { id: rawData['players.0.id'], level: rawData['players.0.level'] },
        { id: rawData['players.1.id'], level: rawData['players.1.level'] },
        { id: rawData['players.2.id'], level: rawData['players.2.level'] },
        { id: rawData['players.3.id'], level: rawData['players.3.level'] },
      ];
      
      const screenshotFile = formData.get('screenshot') as File;
      
      const dataToValidate = {
        teamName: rawData.teamName,
        contactEmail: rawData.contactEmail,
        contactPhone: rawData.contactPhone,
        utrNumber: rawData.utrNumber,
        players: players,
        screenshot: screenshotFile
      };
      
      const validationResult = registrationSchema.safeParse(dataToValidate);
      if (!validationResult.success) {
          const firstError = validationResult.error.errors[0];
          return { success: false, error: `${firstError.path.join('.')}: ${firstError.message}` };
      }
      const { teamName, players: validatedPlayers, contactEmail, contactPhone, utrNumber, screenshot } = validationResult.data;

      // 3. AI Payment Verification (BLOCKING STEP)
      const verificationResult = await runAIVerification(screenshot, utrNumber);
      if (!verificationResult.isUtrMatch) {
          return {
              success: false,
              error: verificationResult.reason,
          };
      }

      // 4. Date Verification to prevent screenshot reuse across weeks
      if (!verificationResult.transactionDate) {
          return {
              success: false,
              error: "AI could not determine the transaction date from the screenshot. Please try with a clearer screenshot.",
          };
      }
      const transactionDate = new Date(verificationResult.transactionDate);
      const weekStartDate = new Date(state.registrationWeekStart);
      if (transactionDate < weekStartDate) {
          return {
              success: false,
              error: "This payment screenshot is from a previous week. Please use a new payment for this week's registration.",
          };
      }

      // 5. Duplicate Data Check (within the current week)
      const screenshotBufferForHash = Buffer.from(await screenshot.arrayBuffer());
      const screenshotHash = crypto.createHash('sha256').update(screenshotBufferForHash).digest('hex');

      if (weeklyData.teams.some(team => team.utrNumber.trim().toLowerCase() === utrNumber.trim().toLowerCase())) {
        return { success: false, error: 'This UTR number has already been used this week.' };
      }
      if (weeklyData.teams.some(team => team.contactEmail.trim().toLowerCase() === contactEmail.trim().toLowerCase())) {
        return { success: false, error: 'This email has already been used this week.' };
      }
      if (weeklyData.teams.some(team => team.contactPhone.trim() === contactPhone.trim())) {
        return { success: false, error: 'This phone number has already been used this week.' };
      }
      if (weeklyData.teams.some(team => team.screenshotHash === screenshotHash)) {
          return { success: false, error: 'This payment screenshot has already been used this week.' };
      }

      // 6. Upload Screenshot
      let screenshotUrl: string | null = null;
      try {
        screenshotUrl = await uploadFileToStorage(screenshot, 'screenshots/');
      } catch (uploadError) {
          console.error("Critical: Screenshot upload failed after successful verification.", uploadError);
          // Don't fail the registration, but log it. Admin can manually check.
      }

      // 7. Save Registration Data
      const registrationData: TeamRegistrationData = {
        teamName,
        players: validatedPlayers,
        contactEmail,
        contactPhone,
        utrNumber,
        screenshotHash,
        registrationTime: new Date().toISOString(),
      };
      
      weeklyData.teams.push(registrationData);
      const updatedState: RegistrationState = {
        ...state,
        registeredTeamsCount: weeklyData.teams.length,
      };
      await writeJsonFile(registrationsPath, weeklyData);
      await writeJsonFile(statePath, updatedState);
      
      // 8. Send Emails (can be done in parallel)
      await Promise.all([
          sendNewRegistrationEmail({ teamName, players: validatedPlayers, contactEmail, contactPhone, utrNumber }, screenshotUrl),
          sendConfirmationEmailToUser(registrationData)
      ]);
      
      console.log('Registration complete for:', registrationData.teamName);

      // 9. Return Success
      return {
        success: true,
        message: 'Registration Submitted!',
        data: registrationData,
      };

  } catch (error) {
      console.error("Unhandled error in registerTeam action:", error);
       if (error instanceof z.ZodError) {
          return { success: false, error: error.errors[0].message };
      }
      return {
          success: false,
          error: `An unexpected server error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
  }
}


/**
 * Fetches all registered teams for the current week. (For Admin Dashboard & Teams page)
 * This version is for public display and omits sensitive info.
 */
export async function getWeeklyRegistrations(): Promise<Omit<TeamRegistrationData, 'utrNumber' | 'registrationTime' | 'contactPhone' | 'contactEmail' | 'screenshotHash'>[]> {
    const { weeklyData } = await manageWeeklyState();
    if (!weeklyData) return [];
    return weeklyData.teams.map(({ teamName, players }) => ({ teamName, players }));
}


/**
 * Fetches all registered teams for the current week, including all data for admin use.
 */
export async function getWeeklyRegistrationsForAdmin(): Promise<TeamRegistrationData[]> {
    const { weeklyData } = await manageWeeklyState();
    return weeklyData.teams;
}


/**
 * Fetches the history of all weekly winners from a JSON file.
 */
async function readWinnersHistory(): Promise<WeeklyWinner[]> {
    const winners = await readJsonFile<WeeklyWinner[]>(winnersPath);
    return winners || [];
}

/**
 * Saves the weekly winners and sends them a congratulatory email.
 */
export async function processAndEmailWinners(firstPlaceTeam: TeamRegistrationData, secondPlaceTeam: TeamRegistrationData) {
    const { state } = await manageWeeklyState();
    
    // 1. Send emails
    await sendWinnerEmail(firstPlaceTeam, '1st');
    await sendWinnerEmail(secondPlaceTeam, '2nd');

    // 2. Save winner data
    const newWinnerRecord: WeeklyWinner = {
        weekStart: state.registrationWeekStart,
        winners: [
            { rank: '1st', teamName: firstPlaceTeam.teamName },
            { rank: '2nd', teamName: secondPlaceTeam.teamName },
        ],
        totalTeams: state.registeredTeamsCount, // Store the final count
    };

    let allWinners = await readWinnersHistory();
    
    // Prevent adding duplicate winner entries for the same week
    allWinners = allWinners.filter(w => w.weekStart !== newWinnerRecord.weekStart);
    allWinners.unshift(newWinnerRecord); // Add new winners to the beginning of the list

    await writeJsonFile(winnersPath, allWinners);

    console.log(`Winners for week ${state.registrationWeekStart} processed and saved.`);
}

/**
 * Sends a congratulatory email to a winning team.
 */
async function sendWinnerEmail(teamData: {teamName: string, contactEmail: string}, rank: '1st' | '2nd') {
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const { EMAIL_USER } = process.env;
    if (!RESEND_API_KEY) {
        const errorMessage = "Resend API key is missing. Cannot send winner email.";
        console.error(errorMessage);
        throw new Error(errorMessage);
    }
    if (!EMAIL_USER) {
        const errorMessage = "Sender email not configured. Cannot send winner email.";
        console.error(errorMessage);
        throw new Error(errorMessage);
    }

    const resend = new Resend(RESEND_API_KEY);
    const isFirstPlace = rank === '1st';
    const subject = isFirstPlace 
        ? '🏆 Congratulations on Your 1st Place Victory! 🏆'
        : '🎉 Congratulations on Securing 2nd Place! 🎉';
    
    const prize = isFirstPlace ? '₹750' : '₹120';
    const message = isFirstPlace
        ? "Your skill and dedication have paid off. You are the champions of this week's tournament!"
        : "You fought hard and showed incredible spirit. A well-deserved 2nd place finish!";

    const emailBody = `
        <h1>Congratulations, ${teamData.teamName}!</h1>
        <p>On behalf of The Founders Official, we would like to extend our warmest congratulations to you and your team for securing <strong>${rank} Place</strong> in the tournament.</p>
        <p>${message}</p>
        <hr>
        <h2>Prize Information:</h2>
        <p><strong>Your Prize:</strong> ${prize}</p>
        <p>Your prize money will be sent to you shortly. We will contact you for the payment details.</p>
        <hr>
        <p>We are proud of your achievement and look forward to seeing you dominate in future tournaments.</p>
        <p>Keep up the great work!</p>
        <br>
        <p>Best regards,<br>The Founders Official</p>
    `;

    try {
        await resend.emails.send({
            from: `"The Founders Official" <${EMAIL_USER}>`,
            to: teamData.contactEmail,
            subject: subject,
            html: emailBody,
        });
        console.log(`Winner email sent to ${rank} place team: ${teamData.teamName}`);
    } catch (error) {
        console.error(`Error sending winner email to ${teamData.teamName} via Resend:`, error);
        throw new Error("Failed to send the congratulatory email.");
    }
}


/**
 * Fetches the history of all weekly winners.
 */
export async function getWinnersHistory(): Promise<WeeklyWinner[]> {
    return await readWinnersHistory();
}

/**
 * Fetches the history of all weekly winners for the balance page.
 */
export async function getBalanceHistory(): Promise<WeeklyWinner[]> {
    return getWinnersHistory();
}

/**
 * Fetches a single team's registration details by their UTR number for the current week.
 */
export async function getTeamByUTR(utr: string): Promise<{ success: boolean; data?: TeamRegistrationData; error?: string }> {
    if (!utr || utr.trim() === '') {
        return { success: false, error: 'UTR number is required.' };
    }

    const { weeklyData } = await manageWeeklyState();

    const foundTeam = weeklyData.teams.find(
        team => team.utrNumber.trim().toLowerCase() === utr.trim().toLowerCase()
    );

    if (foundTeam) {
        return { success: true, data: foundTeam };
    } else {
        return { success: false, error: 'No registration found for this UTR number in the current week.' };
    }
}


/**
 * Fetches all archived registration data. For admin use only.
 */
export async function getArchivedRegistrations(): Promise<WeeklyData[]> {
    await ensureDataDirectories();
    const allFiles = await fs.readdir(archiveDir);
    
    const jsonFiles = allFiles
        .filter(file => file.startsWith('registrations-') && file.endsWith('.json'))
        .sort() // Sorts alphabetically, which works for YYYY-MM-DD format
        .reverse(); // Show most recent first

    const allData: WeeklyData[] = [];

    for (const file of jsonFiles) {
        const filePath = path.join(archiveDir, file);
        const data = await readJsonFile<WeeklyData>(filePath);
        if (data) {
            allData.push(data);
        }
    }

    return allData;
}
