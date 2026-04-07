import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as PDFDocument from 'pdfkit';
import { SearchRequest } from '../../database/entities/search-request.entity';
import { LandRecord } from '../../database/entities/land-record.entity';
import { RiskReport } from '../../database/entities/risk-report.entity';
import { Transaction } from '../../database/entities/transaction.entity';
import { UploadService } from '../upload/upload.service';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectRepository(SearchRequest) private searchRepo: Repository<SearchRequest>,
    @InjectRepository(LandRecord) private landRepo: Repository<LandRecord>,
    @InjectRepository(RiskReport) private riskRepo: Repository<RiskReport>,
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
    private uploadService: UploadService,
  ) {}

  async getReport(searchId: string, userId: string) {
    const search = await this.searchRepo.findOne({
      where: { id: searchId, userId },
      relations: ['landRecord', 'landRecord.transactions', 'riskReport'],
    });
    if (!search) throw new NotFoundException('Report not found');

    let reportPdfSignedUrl: string | null = null;
    if (search.reportPdfUrl) {
      reportPdfSignedUrl = await this.uploadService.getSignedDownloadUrl(search.reportPdfUrl);
    }

    return { ...search, reportPdfSignedUrl };
  }

  async generatePdf(
    search: SearchRequest,
    land: LandRecord,
    risk: RiskReport,
  ): Promise<string> {
    const transactions = await this.txRepo.find({
      where: { landRecordId: land.id },
      order: { registrationDate: 'DESC' },
    });

    const buf = await this.buildPdfBuffer(search, land, risk, transactions);

    const key = await this.uploadService.uploadBuffer(
      buf,
      `reports/${search.userId}/${search.id}-report.pdf`,
      'application/pdf',
    );

    this.logger.log(`PDF report generated: ${key}`);
    return key;
  }

  private buildPdfBuffer(
    search: SearchRequest,
    land: LandRecord,
    risk: RiskReport,
    transactions: Transaction[],
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const COLORS = {
        primary: '#1a365d',
        accent: '#2b6cb0',
        danger: '#c53030',
        warning: '#d69e2e',
        success: '#276749',
        text: '#2d3748',
        muted: '#718096',
        border: '#e2e8f0',
      };

      const riskColor: Record<string, string> = {
        LOW: COLORS.success,
        MEDIUM: COLORS.warning,
        HIGH: COLORS.danger,
        CRITICAL: '#742a2a',
        UNKNOWN: COLORS.muted,
      };

      // ---- HEADER ----
      doc.rect(0, 0, doc.page.width, 80).fill(COLORS.primary);
      doc.fillColor('white').fontSize(20).font('Helvetica-Bold')
        .text('TN Land Verification Report', 50, 25);
      doc.fontSize(10).font('Helvetica')
        .text(`Generated: ${new Date().toLocaleString('en-IN')}`, 50, 52);
      doc.text(`Report ID: ${search.id}`, 350, 52);

      doc.moveDown(3);

      // ---- DISCLAIMER ----
      doc.fillColor(COLORS.warning).fontSize(8).font('Helvetica-Oblique')
        .text(
          '⚠ DISCLAIMER: This app aggregates publicly available data. Verify legally before purchase. This report does not constitute legal advice.',
          50, 95, { width: 500 },
        );

      doc.moveDown(2);

      // ---- RISK SCORE BOX ----
      const riskY = doc.y;
      const cat = risk.riskCategory;
      doc.rect(50, riskY, 500, 70)
        .fillAndStroke(riskColor[cat] + '15', riskColor[cat]);
      doc.fillColor(riskColor[cat]).fontSize(28).font('Helvetica-Bold')
        .text(`Risk Score: ${risk.riskScore}/100`, 60, riskY + 10);
      doc.fontSize(14).text(`Category: ${cat}`, 60, riskY + 42);
      doc.moveDown(5);

      // ---- LAND DETAILS ----
      this.pdfSection(doc, 'Land Details', COLORS.primary);
      const details = [
        ['Owner Name', land.ownerName || 'N/A'],
        ['Father / Husband', land.fatherName || 'N/A'],
        ['Survey Number', land.surveyNumber || search.surveyNumber || 'N/A'],
        ['Patta Number', land.pattaNumber || 'N/A'],
        ['District', land.district || search.district],
        ['Taluk', land.taluk || search.taluk || 'N/A'],
        ['Village', land.village || search.village || 'N/A'],
        ['Land Classification', land.landClassification || 'N/A'],
        ['Extent (Hectares)', land.extentHectares ? String(land.extentHectares) : 'N/A'],
        ['Has Encumbrance', land.hasEncumbrance ? 'YES' : 'NO'],
        ['Data Source', land.dataSource || 'automation'],
      ];
      this.pdfTable(doc, details, COLORS);

      doc.moveDown();

      // ---- RISK FACTORS ----
      this.pdfSection(doc, 'Risk Factors', COLORS.primary);
      if (risk.riskFactors.length === 0) {
        doc.fillColor(COLORS.success).fontSize(10).text('✓ No risk factors detected.');
      } else {
        for (const f of risk.riskFactors) {
          const color = f.severity === 'critical' ? COLORS.danger :
            f.severity === 'high' ? '#c05621' :
            f.severity === 'medium' ? COLORS.warning : COLORS.muted;
          doc.fillColor(color).fontSize(10).font('Helvetica-Bold')
            .text(`[${f.severity.toUpperCase()}] ${f.description}`, { indent: 10 });
          if (f.details) {
            doc.fillColor(COLORS.text).font('Helvetica').fontSize(9)
              .text(f.details, { indent: 20 });
          }
          doc.moveDown(0.5);
        }
      }

      // ---- SUMMARY & RECOMMENDATION ----
      doc.moveDown();
      this.pdfSection(doc, 'Summary', COLORS.primary);
      doc.fillColor(COLORS.text).fontSize(10).font('Helvetica')
        .text(risk.summary || 'N/A', { indent: 10 });

      doc.moveDown();
      this.pdfSection(doc, 'Recommendation', COLORS.primary);
      doc.fillColor(COLORS.text).fontSize(10)
        .text(risk.recommendation || 'Consult a legal professional.', { indent: 10 });

      // ---- TRANSACTION TIMELINE ----
      if (transactions.length > 0) {
        doc.addPage();
        this.pdfSection(doc, `Transaction History (${transactions.length} records)`, COLORS.primary);

        for (const tx of transactions) {
          doc.fillColor(COLORS.accent).fontSize(10).font('Helvetica-Bold')
            .text(`${tx.registrationDate || 'Unknown date'} — ${tx.documentType || 'Unknown type'}`);
          doc.fillColor(COLORS.text).font('Helvetica').fontSize(9)
            .text(`Doc No: ${tx.documentNumber || 'N/A'}  |  SRO: ${tx.sro || 'N/A'}`);
          doc.text(`Seller: ${tx.sellerName || 'N/A'}  →  Buyer: ${tx.buyerName || 'N/A'}`);
          if (tx.considerationAmount) {
            doc.text(`Consideration: ₹${tx.considerationAmount.toLocaleString('en-IN')}`);
          }
          doc.moveDown(0.5).moveTo(50, doc.y).lineTo(550, doc.y).strokeColor(COLORS.border).stroke();
          doc.moveDown(0.5);
        }
      }

      // ---- FOOTER ----
      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        doc.fillColor(COLORS.muted).fontSize(8)
          .text(
            'TN Land Verification | www.tnlandverify.in | This report is for informational purposes only.',
            50, doc.page.height - 40, { align: 'center', width: 500 },
          );
      }

      doc.end();
    });
  }

  private pdfSection(doc: PDFKit.PDFDocument, title: string, color: string) {
    doc.fillColor(color).fontSize(13).font('Helvetica-Bold')
      .text(title);
    doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor(color).stroke();
    doc.moveDown(0.5);
  }

  private pdfTable(
    doc: PDFKit.PDFDocument,
    rows: [string, string][],
    colors: Record<string, string>,
  ) {
    for (const [label, value] of rows) {
      const y = doc.y;
      doc.fillColor(colors.muted).fontSize(9).font('Helvetica-Bold')
        .text(label, 50, y, { width: 180, continued: false });
      doc.fillColor(colors.text).fontSize(9).font('Helvetica')
        .text(value, 240, y, { width: 310 });
      doc.moveDown(0.4);
    }
  }
}
