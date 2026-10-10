import re
def sub(path, pat, rep, flags=re.S, count=1):
    s=open(path).read()
    n=re.subn(pat,rep,s,count=count,flags=flags)
    assert n[1], (path,pat)
    open(path,'w').write(n[0])
sub('templates/index.html', r'<div class="grid cols-3"><div class="reveal"><article class="card" data-tilt data-cat="strength">.*?</article></div></div>\n</div></section>', '<div class="grid cols-3" id="featured-grid"><p class="muted">Loading...</p></div>\n</div></section>')
sub('templates/index.html', r'Sample testimonial &middot; Member since 2023', 'Member since 2023')
sub('templates/membership.html', r'Prices shown in Indian rupees\. Sample pricing for a fictional club\.', 'Prices shown in Indian rupees.')
sub('templates/contact.html', r'<select id="interest" name="interest">.*?</select>', '<select id="interest" name="interest">{{interest_options}}</select>')
sub('templates/contact.html', r'<select id="slot" name="slot">.*?</select>', '<select id="slot" name="slot">{{slot_options}}</select>')
sub('templates/contact.html', r'<select id="plan" name="plan">.*?</select>', '<select id="plan" name="plan"><option value="">Not sure yet</option></select>')
sub('templates/contact.html', r' data-copy="[^"]*"', '', count=0)
sub('templates/checkout.html', r'Review your plan, then complete a test payment\. No real money moves in this demo\.', 'Review your plan, then complete your payment.')
sub('templates/_footer.html', r'<div class="foot-bottom">.*?</div>\n</div></footer>', '''<div class="foot-bottom"><span>&copy; {{year}} {{brand}}.</span><span data-c="site.20">All rights reserved.</span></div>
</div></footer>''')
sub('templates/_footer.html', r'(<div><h4 data-c="site\.\d+">Contact</h4>)', '''<div class="foot-news"><h4 data-c="site.30">Newsletter</h4><p class="muted" data-c="site.31">News, new classes and offers. No spam.</p>
<form class="news-form" data-newsletter novalidate><label class="sr" for="news-email">Email address</label><input id="news-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required><input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><button class="btn btn--sm" type="submit">Subscribe</button><p class="form-note" role="status" hidden></p></form>{{social}}</div>
\\1''')
