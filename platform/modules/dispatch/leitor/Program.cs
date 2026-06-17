using System;
using System.IO;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;

var pdfPath = @"C:\Users\Paulo H Parreira\Downloads\Analise da qualidade Plano de conta e Sub Plano.pdf";

Console.WriteLine("=== LENDO PDF ===");
Console.WriteLine($"Arquivo: {Path.GetFileName(pdfPath)}");
Console.WriteLine();

using var doc = PdfDocument.Open(pdfPath);
Console.WriteLine($"Total de páginas: {doc.NumberOfPages}");
Console.WriteLine();

foreach (var page in doc.GetPages())
{
    Console.WriteLine($"--- PÁGINA {page.Number} ---");
    Console.WriteLine(page.Text);
    Console.WriteLine();
}
