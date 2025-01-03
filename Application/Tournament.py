from datetime import date

class Tournament:
	def __init__(self, c_date=date.today(), c_name, c_type):
		self.comp_date = c_date
		self.comp_name = c_name
		self.comp_type = c_type
		self.comp_code = createCode(self.comp_date, self.comp_name)


def createCode(c_date, c_name):
	competition_code = ""
	competition_code += str(c_date.year)
	for i in c_name.split():
		competition_code += i[0]

	return competition_code
