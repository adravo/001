import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RiskReport, RiskCategory, RiskFactor } from '../../database/entities/risk-report.entity';
import { LandRecord } from '../../database/entities/land-record.entity';
import { SearchRequest } from '../../database/entities/search-request.entity';
import { Transaction } from '../../database/entities/transaction.entity';

interface RiskCheck {
  code: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  weight: number; // contribution to score (0–100 cumulative)
  triggered: boolean;
  details?: string;
}

@Injectable()
export class RiskService {
  private readonly logger = new Logger(RiskService.name);

  constructor(
    @InjectRepository(RiskReport) private riskRepo: Repository<RiskReport>,
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
  ) {}

  async analyze(search: SearchRequest, land: LandRecord): Promise<RiskReport> {
    this.logger.log(`Running risk analysis for land record ${land.id}`);

    const transactions = await this.txRepo.find({
      where: { landRecordId: land.id },
      order: { registrationDate: 'ASC' },
    });

    const checks = this.runChecks(search, land, transactions);
    const { score, category, factors } = this.computeScore(checks);
    const { summary, recommendation } = this.buildNarrative(category, checks);

    const report = this.riskRepo.create({
      searchRequest: search,
      riskScore: score,
      riskCategory: category,
      riskFactors: factors,
      summary,
      recommendation,
      frequentOwnershipChanges: checks.find(c => c.code === 'FREQ_OWNERSHIP')?.triggered || false,
      missingEcYears: checks.find(c => c.code === 'MISSING_EC')?.triggered || false,
      ownerMismatch: checks.find(c => c.code === 'OWNER_MISMATCH')?.triggered || false,
      encumbranceFound: checks.find(c => c.code === 'ENCUMBRANCE')?.triggered || false,
      mortgageFound: checks.find(c => c.code === 'MORTGAGE')?.triggered || false,
      legalDisputeIndicator: checks.find(c => c.code === 'LEGAL_DISPUTE')?.triggered || false,
      dataIncomplete: checks.find(c => c.code === 'DATA_INCOMPLETE')?.triggered || false,
    });

    return this.riskRepo.save(report);
  }

  private runChecks(
    search: SearchRequest,
    land: LandRecord,
    transactions: Transaction[],
  ): RiskCheck[] {
    const checks: RiskCheck[] = [];

    // ---- 1. Data completeness ----
    const hasData = !!(land.ownerName || land.pattaNumber || land.surveyNumber);
    checks.push({
      code: 'DATA_INCOMPLETE',
      description: 'Incomplete or missing land records',
      severity: 'high',
      weight: 20,
      triggered: !hasData,
      details: !hasData ? 'No owner name, patta number, or survey number found in retrieved data.' : undefined,
    });

    // ---- 2. Frequent ownership changes ----
    const saleTransactions = transactions.filter(
      t => t.documentType?.toLowerCase().includes('sale'),
    );
    const last5Years = new Date();
    last5Years.setFullYear(last5Years.getFullYear() - 5);
    const recentSales = saleTransactions.filter(t => {
      if (!t.registrationDate) return false;
      try { return new Date(t.registrationDate) >= last5Years; } catch { return false; }
    });
    const frequentChanges = recentSales.length >= 3;
    checks.push({
      code: 'FREQ_OWNERSHIP',
      description: 'Frequent ownership changes in last 5 years',
      severity: 'high',
      weight: 25,
      triggered: frequentChanges,
      details: frequentChanges
        ? `${recentSales.length} sale transactions in the past 5 years — indicates potential dispute or quick flipping.`
        : undefined,
    });

    // ---- 3. Missing EC years ----
    const currentYear = new Date().getFullYear();
    let missingEc = false;
    let missingEcDetail = '';
    if (land.ecFromYear && land.ecToYear) {
      const from = parseInt(land.ecFromYear);
      const to = parseInt(land.ecToYear);
      const gap = currentYear - to;
      if (gap > 2) {
        missingEc = true;
        missingEcDetail = `EC data only available up to ${land.ecToYear}. Gap of ${gap} years missing.`;
      }
    } else if (!transactions.length && hasData) {
      missingEc = true;
      missingEcDetail = 'No EC records found. Encumbrance history is unknown.';
    }
    checks.push({
      code: 'MISSING_EC',
      description: 'Missing or incomplete EC (Encumbrance Certificate) years',
      severity: 'medium',
      weight: 15,
      triggered: missingEc,
      details: missingEcDetail || undefined,
    });

    // ---- 4. Owner name mismatch (EC buyer vs Patta owner) ----
    const lastBuyer = transactions.length > 0
      ? transactions[transactions.length - 1].buyerName
      : null;
    const pattaOwner = land.ownerName;
    let ownerMismatch = false;
    let mismatchDetail = '';
    if (lastBuyer && pattaOwner) {
      const normalize = (s: string) =>
        s.toLowerCase().replace(/\s+/g, ' ').trim();
      ownerMismatch = !normalize(lastBuyer).includes(normalize(pattaOwner).split(' ')[0]) &&
        !normalize(pattaOwner).includes(normalize(lastBuyer).split(' ')[0]);
      if (ownerMismatch) {
        mismatchDetail = `EC shows "${lastBuyer}" as last buyer but Patta shows "${pattaOwner}" as owner. CRITICAL mismatch.`;
      }
    }
    checks.push({
      code: 'OWNER_MISMATCH',
      description: 'Owner name mismatch between EC and Patta records',
      severity: 'critical',
      weight: 35,
      triggered: ownerMismatch,
      details: mismatchDetail || undefined,
    });

    // ---- 5. Active encumbrance ----
    const mortgage = transactions.some(t =>
      t.documentType?.toLowerCase().includes('mortgage') ||
      t.documentType?.toLowerCase().includes('hypothecation'),
    );
    const release = transactions.some(t =>
      t.documentType?.toLowerCase().includes('release') ||
      t.documentType?.toLowerCase().includes('discharge'),
    );
    const activeMortgage = mortgage && !release;
    checks.push({
      code: 'MORTGAGE',
      description: 'Unresolved mortgage or hypothecation found',
      severity: 'high',
      weight: 25,
      triggered: activeMortgage,
      details: activeMortgage
        ? 'A mortgage/hypothecation document found without a corresponding release.'
        : undefined,
    });

    checks.push({
      code: 'ENCUMBRANCE',
      description: 'Land has encumbrances registered',
      severity: 'medium',
      weight: 15,
      triggered: land.hasEncumbrance,
      details: land.hasEncumbrance
        ? 'Encumbrance records found — review individual transactions.'
        : undefined,
    });

    // ---- 6. Legal dispute indicators ----
    const legalTerms = ['court', 'injunction', 'litigation', 'dispute', 'attachment', 'partition'];
    const hasLegalIssue = transactions.some(t =>
      legalTerms.some(term =>
        t.documentType?.toLowerCase().includes(term) ||
        JSON.stringify(t.rawData || '').toLowerCase().includes(term),
      ),
    );
    checks.push({
      code: 'LEGAL_DISPUTE',
      description: 'Legal dispute or court order indicators found',
      severity: 'critical',
      weight: 40,
      triggered: hasLegalIssue,
      details: hasLegalIssue
        ? 'Transaction records contain terms indicating legal disputes.'
        : undefined,
    });

    // ---- 7. Multiple partition/gift deeds (possible family dispute) ----
    const partitionCount = transactions.filter(t =>
      t.documentType?.toLowerCase().includes('partition'),
    ).length;
    checks.push({
      code: 'PARTITION_RISK',
      description: 'Multiple partition deeds — possible family dispute',
      severity: 'medium',
      weight: 15,
      triggered: partitionCount >= 2,
      details: partitionCount >= 2
        ? `${partitionCount} partition deeds on record — may indicate unresolved inheritance disputes.`
        : undefined,
    });

    return checks;
  }

  private computeScore(checks: RiskCheck[]): {
    score: number;
    category: RiskCategory;
    factors: RiskFactor[];
  } {
    // Base score 0 — add penalty for each triggered check
    let score = 0;
    const factors: RiskFactor[] = [];
    let noData = false;

    for (const c of checks) {
      if (c.triggered) {
        if (c.code === 'DATA_INCOMPLETE') {
          noData = true;
        }
        score += c.weight;
        factors.push({
          code: c.code,
          description: c.description,
          severity: c.severity,
          weight: c.weight,
          details: c.details,
        });
      }
    }

    // Cap at 100
    score = Math.min(score, 100);

    let category: RiskCategory;
    if (noData && score < 30) {
      category = 'UNKNOWN';
    } else if (score >= 70) {
      category = 'CRITICAL';
    } else if (score >= 45) {
      category = 'HIGH';
    } else if (score >= 20) {
      category = 'MEDIUM';
    } else {
      category = 'LOW';
    }

    return { score, category, factors };
  }

  private buildNarrative(
    category: RiskCategory,
    checks: RiskCheck[],
  ): { summary: string; recommendation: string } {
    const triggered = checks.filter(c => c.triggered);

    if (triggered.length === 0) {
      return {
        summary: 'No risk factors detected. Land records appear clean.',
        recommendation: 'Proceed with standard due diligence. Consult a legal professional before purchase.',
      };
    }

    const issueList = triggered.map(c => `• ${c.description}`).join('\n');

    const summaryMap: Record<RiskCategory, string> = {
      LOW: `Minor concerns identified:\n${issueList}\n\nOverall risk is manageable with proper verification.`,
      MEDIUM: `Moderate risk detected. Issues found:\n${issueList}\n\nAdditional investigation is strongly recommended.`,
      HIGH: `High risk land parcel. Multiple issues found:\n${issueList}\n\nDo not proceed without thorough legal investigation.`,
      CRITICAL: `CRITICAL RISK — DO NOT PROCEED without legal counsel.\nCritical issues found:\n${issueList}`,
      UNKNOWN: 'Insufficient data to compute risk. Manual verification required.',
    };

    const recommendationMap: Record<RiskCategory, string> = {
      LOW: 'Verify Patta and EC manually at the Sub-Registrar Office. Engage a lawyer for title search.',
      MEDIUM: 'Obtain full 30-year EC from SRO. Verify owner chain. Consider title insurance.',
      HIGH: 'Obtain legal opinion from a property lawyer. Do a full title investigation. Check court records.',
      CRITICAL: 'STOP. Engage a senior property lawyer immediately. Do NOT make any advance payments.',
      UNKNOWN: 'Upload EC and Patta documents manually for a complete risk assessment.',
    };

    return {
      summary: summaryMap[category],
      recommendation: recommendationMap[category],
    };
  }
}
